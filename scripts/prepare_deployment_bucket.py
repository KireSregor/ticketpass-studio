"""Prepare the private artifact bucket required for the first Serverless deployment."""
import argparse
import boto3
from botocore.exceptions import ClientError


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--region', default='us-east-1')
    args = parser.parse_args()
    session = boto3.Session(region_name=args.region)
    account = session.client('sts').get_caller_identity()['Account']
    bucket = f'ticketpass-studio-artifacts-{account}-{args.region}'
    s3 = session.client('s3')
    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError as exc:
        if exc.response['Error']['Code'] not in ('404', 'NoSuchBucket'):
            raise
        options = {'Bucket': bucket}
        if args.region != 'us-east-1':
            options['CreateBucketConfiguration'] = {'LocationConstraint': args.region}
        s3.create_bucket(**options)
    s3.put_public_access_block(Bucket=bucket, PublicAccessBlockConfiguration={key: True for key in ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets']})
    s3.put_bucket_encryption(Bucket=bucket, ServerSideEncryptionConfiguration={'Rules': [{'ApplyServerSideEncryptionByDefault': {'SSEAlgorithm': 'AES256'}}]})
    print(bucket)


if __name__ == '__main__':
    main()
