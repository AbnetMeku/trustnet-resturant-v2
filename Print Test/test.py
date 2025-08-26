from escpos.printer import Network
from PIL import Image


img = Image.open("TNS.jpeg") #abreh ande folder gar argew with this file


PRINTER_WIDTH = 576
if img.width > PRINTER_WIDTH:
    img = img.resize((PRINTER_WIDTH, int(img.height * (PRINTER_WIDTH / img.width))))


if img.width < PRINTER_WIDTH:
    canvas = Image.new("RGB", (PRINTER_WIDTH, img.height), "white")
    offset = (PRINTER_WIDTH - img.width) // 2
    canvas.paste(img, (offset, 0))
    img = canvas

p = Network("192.168.1.100")

p.image(img)
p.cut()
