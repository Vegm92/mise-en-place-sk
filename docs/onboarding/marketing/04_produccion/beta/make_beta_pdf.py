#!/usr/bin/env python3
"""Genera la guía PDF de registro para beta testers de Mise en Place (código MISE50)."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas

# Paleta sencilla acorde a una app de restauración
INK    = HexColor('#1f2937')   # texto principal
MUTED  = HexColor('#6b7280')   # texto secundario
BRAND  = HexColor('#b45309')   # ámbar oscuro (marca)
BRANDL = HexColor('#fef3c7')   # ámbar claro (fondos)
LINE   = HexColor('#e5e7eb')

W, H = A4
OUT = 'guia-beta-mise-en-place.pdf'

c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle('Mise en Place — Guía de registro para beta testers')
c.setAuthor('Mise en Place')

M = 20 * mm  # margen

# ---------- Cabecera ----------
c.setFillColor(BRAND)
c.rect(0, H - 42 * mm, W, 42 * mm, stroke=0, fill=1)
c.setFillColor(white)
c.setFont('Helvetica-Bold', 24)
c.drawString(M, H - 20 * mm, 'Mise en Place')
c.setFont('Helvetica', 13)
c.drawString(M, H - 28 * mm, 'Guía rápida para beta testers · Regístrate en 5 minutos')
c.setFont('Helvetica-Oblique', 10)
c.drawString(M, H - 35 * mm, 'Tus facturas de proveedores, fotografiadas y convertidas en datos.')

y = H - 56 * mm

# ---------- Caja del código ----------
box_h = 24 * mm
c.setFillColor(BRANDL)
c.setStrokeColor(BRAND)
c.setLineWidth(1.2)
c.roundRect(M, y - box_h, W - 2 * M, box_h, 4 * mm, stroke=1, fill=1)
c.setFillColor(BRAND)
c.setFont('Helvetica-Bold', 11)
c.drawString(M + 8 * mm, y - 8 * mm, 'TU CÓDIGO DE BETA TESTER')
c.setFont('Courier-Bold', 26)
c.drawString(M + 8 * mm, y - 19 * mm, 'MISE50')
c.setFillColor(INK)
c.setFont('Helvetica', 10)
c.drawRightString(W - M - 8 * mm, y - 12 * mm, 'Guárdalo: lo usarás en el paso 6')
c.drawRightString(W - M - 8 * mm, y - 17 * mm, 'para activar tu descuento de beta.')

y -= box_h + 12 * mm

# ---------- Pasos ----------
steps = [
    ('Entra en la página de registro',
     ['Abre en tu móvil u ordenador:  https://mise-place.com/signup']),
    ('Crea tu cuenta',
     ['Introduce tu email y una contraseña (mínimo 8 caracteres), acepta los',
      'términos y pulsa «Crear cuenta». También puedes usar «Continuar con Google».']),
    ('Verifica tu email',
     ['Te enviaremos un correo de verificación. Ábrelo y pulsa el enlace.',
      '¿No llega? Revisa spam o pulsa «Reenviar» en la misma pantalla.']),
    ('Configura tu restaurante',
     ['Al entrar por primera vez, escribe el nombre de tu restaurante',
      'y completa el breve asistente de bienvenida.']),
    ('Sube tu primera factura',
     ['Pulsa «Subir factura» y haz una foto (o sube un PDF/JPG/PNG).',
      'La IA extraerá proveedor, importes y líneas; revisa y confirma.']),
    ('Activa tu descuento con el código MISE50',
     ['Ve a Ajustes → Suscripción y elige tu plan. En la pantalla de pago,',
      'pulsa «Añadir código de promoción», escribe MISE50 y aplícalo.']),
]

for i, (title, lines) in enumerate(steps, start=1):
    # círculo numerado
    r = 4.5 * mm
    cx = M + r
    cy = y - r + 1.5 * mm
    c.setFillColor(BRAND)
    c.circle(cx, cy, r, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 12)
    c.drawCentredString(cx, cy - 1.5 * mm, str(i))

    tx = M + 2 * r + 4 * mm
    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 12.5)
    c.drawString(tx, y - 3.5 * mm, title)
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 10.5)
    ly = y - 9 * mm
    for line in lines:
        c.drawString(tx, ly, line)
        ly -= 5 * mm
    y = ly - 6 * mm

# ---------- Pie ----------
c.setStrokeColor(LINE)
c.setLineWidth(0.8)
c.line(M, y, W - M, y)
y -= 7 * mm
c.setFillColor(INK)
c.setFont('Helvetica-Bold', 10.5)
c.drawString(M, y, '¿Dudas o algo no funciona?')
c.setFillColor(MUTED)
c.setFont('Helvetica', 10)
c.drawString(M, y - 5 * mm, 'Eres beta tester: tu opinión importa. Escríbenos y cuéntanos cualquier problema o idea.')
c.drawString(M, y - 10 * mm, 'Gracias por ayudarnos a construir Mise en Place.')

c.setFillColor(MUTED)
c.setFont('Helvetica-Oblique', 8.5)
c.drawCentredString(W / 2, 12 * mm, 'Mise en Place · https://mise-place.com · Programa beta 2026')

c.save()
print('OK:', OUT)
