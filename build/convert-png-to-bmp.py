import os
from PIL import Image

build_dir = os.path.join(os.path.dirname(__file__))

# Convert PNG to 24-bit BMP
for name in ['installerSidebar', 'installerHeader', 'uninstallerSidebar']:
    png_path = os.path.join(build_dir, f'{name}.png')
    bmp_path = os.path.join(build_dir, f'{name}.bmp')
    
    img = Image.open(png_path)
    # Convert to RGB (remove alpha) and save as 24-bit BMP
    img = img.convert('RGB')
    img.save(bmp_path, 'BMP')
    print(f'{name}.bmp saved ({os.path.getsize(bmp_path)} bytes)')

print('All BMP files generated with Pillow!')
