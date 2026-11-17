import json
import os
import sqlite3
from config import DATA_DIR, STORAGE


class Conflict(Exception):
    pass


def table_name(kind):
    group = kind if kind in ('events', 'imports') else 'auth'
    return os.environ[f'{group.upper()}_TABLE']


def connection():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATA_DIR / 'ticketpass.sqlite', timeout=15)
    conn.execute('CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, owner TEXT, data TEXT, PRIMARY KEY(kind,id))')
    return conn


def get(kind, key):
    if STORAGE == 'dynamodb':
        import boto3
        row = boto3.resource('dynamodb').Table(table_name(kind)).get_item(Key={'id': f'{kind}#{key}'}, ConsistentRead=True).get('Item')
        return json.loads(row['data']) if row else None
    with connection() as conn:
        row = conn.execute('SELECT data FROM records WHERE kind=? AND id=?', (kind, key)).fetchone()
        return json.loads(row[0]) if row else None


def put(kind, key, data, *, create=False, expected_version=None):
    owner = data.get('organizerId', '')
    if STORAGE == 'dynamodb':
        import boto3
        from botocore.exceptions import ClientError
        item = {'id': f'{kind}#{key}', 'organizerId': owner or 'SYSTEM', 'createdAt': data.get('createdAt', ''), 'data': json.dumps(data, ensure_ascii=False), 'version': data.get('version', 0)}
        params = {'Item': item}
        if 'expiresAt' in data:
            item['expiresAt'] = int(data['expiresAt'])
        if create:
            params['ConditionExpression'] = 'attribute_not_exists(id)'
        elif expected_version is not None:
            params.update(ConditionExpression='#v = :v', ExpressionAttributeNames={'#v': 'version'}, ExpressionAttributeValues={':v': expected_version})
        try:
            boto3.resource('dynamodb').Table(table_name(kind)).put_item(**params)
        except ClientError as exc:
            if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
                raise Conflict() from exc
            raise
        return data
    with connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        old = conn.execute('SELECT data FROM records WHERE kind=? AND id=?', (kind, key)).fetchone()
        if (create and old) or (expected_version is not None and (not old or json.loads(old[0]).get('version') != expected_version)):
            raise Conflict()
        conn.execute('INSERT OR REPLACE INTO records VALUES (?,?,?,?)', (kind, key, owner, json.dumps(data, ensure_ascii=False)))
    return data


def list_records(kind, owner=None):
    if STORAGE == 'dynamodb':
        import boto3
        from boto3.dynamodb.conditions import Key, Attr
        table = boto3.resource('dynamodb').Table(table_name(kind))
        args = {'IndexName': 'ByOwner', 'KeyConditionExpression': Key('organizerId').eq(owner)} if owner else {'FilterExpression': Attr('id').begins_with(f'{kind}#')}
        records = []
        while True:
            page = table.query(**args) if owner else table.scan(**args)
            records.extend(json.loads(row['data']) for row in page.get('Items', []) if row['id'].startswith(f'{kind}#'))
            if not page.get('LastEvaluatedKey'):
                break
            args['ExclusiveStartKey'] = page['LastEvaluatedKey']
        return sorted(records, key=lambda row: row.get('createdAt', ''), reverse=True)
    with connection() as conn:
        query, params = ('SELECT data FROM records WHERE kind=?', [kind])
        if owner:
            query += ' AND owner=?'
            params.append(owner)
        records = [json.loads(row[0]) for row in conn.execute(query, params)]
    return sorted(records, key=lambda row: row.get('createdAt', ''), reverse=True)


def write_blob(key, content):
    if STORAGE == 'dynamodb':
        import boto3
        boto3.client('s3').put_object(Bucket=os.environ['FILES_BUCKET'], Key=key, Body=content, ContentType='text/csv; charset=utf-8' if key.endswith('.csv') else 'application/pdf')
    else:
        path = DATA_DIR / 'files' / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)


def read_blob(key):
    if STORAGE == 'dynamodb':
        import boto3
        client = boto3.client('s3')
        if key.endswith('.pdf') and client.head_object(Bucket=os.environ['FILES_BUCKET'], Key=key)['ContentLength'] > 5 * 1024 * 1024:
            from agent import InputError
            raise InputError('El PDF supera el límite de 5 MB.')
        return client.get_object(Bucket=os.environ['FILES_BUCKET'], Key=key)['Body'].read()
    return (DATA_DIR / 'files' / key).read_bytes()

