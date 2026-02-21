import base64
import os

# Base64 encoded 1x1 red PNG
png_b64 = b'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
img_data = base64.b64decode(png_b64)

for i in range(50):
    with open(f'dummy_data_fixed/cats/img_{i}.png', 'wb') as f:
        f.write(img_data)

for i in range(5):
    with open(f'dummy_data_fixed/dogs/img_{i}.png', 'wb') as f:
        f.write(img_data)

print("Created 50 cats and 5 dogs")
