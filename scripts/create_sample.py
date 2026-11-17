from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

target = Path(__file__).resolve().parents[1] / 'backend/assets/evento-ejemplo.pdf'
target.parent.mkdir(parents=True, exist_ok=True)
pdf = canvas.Canvas(str(target))
pdf.setTitle('TicketPass - Evento ficticio de ejemplo')
for page, date in [(1, '2027-12-12'), (2, '2027-12-19')]:
    pdf.setFillColor(HexColor('#4b42cb'))
    pdf.setFont('Helvetica-Bold', 12)
    pdf.drawString(48, 790, 'TICKETPASS STUDIO / DOCUMENTO DE EJEMPLO')
    pdf.setFillColor(HexColor('#202334'))
    pdf.setFont('Helvetica-Bold', 25)
    pdf.drawString(48, 733, 'Noche de Salsa')
    pdf.setFont('Helvetica', 11)
    lines = [
        'Datos ficticios para probar la importación y detectar una fecha contradictoria.',
        '',
        'Evento: Noche de Salsa',
        f'Fecha: {date}',
        'Hora: 20:00',
        'Lugar: Salón Las Palmeras',
        'Ciudad: Lima',
        'Aforo: 300',
        'Descripción: Música en vivo y una noche para bailar salsa con amigos.',
        'Zonas: [{"name":"General","capacity":300,"price":50}]',
        '',
        'La fecha difiere entre páginas. El organizador debe escoger la correcta.',
        'Este documento no corresponde a un evento real.',
    ]
    y = 682
    for line in lines:
        pdf.drawString(48, y, line)
        y -= 28
    pdf.setFont('Helvetica', 9)
    pdf.drawString(48, 45, f'Página {page} / 2. Ningún dato se publica sin confirmación.')
    pdf.showPage()
pdf.save()
print(target)
