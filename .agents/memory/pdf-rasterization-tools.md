---
name: PDF rasterization tools in this repl
description: Which CLI tools can/can't read PDFs in this environment
---

# Converting PDFs to images in this repl

- **ImageMagick `convert`/`magick` CANNOT read PDF input** here — there is no ghostscript (`gs`) delegate.
- Use **poppler** instead: `pdftoppm` (PDF→image), `pdftotext`, `pdfinfo`.
- Example: `pdftoppm -jpeg -r 150 input.pdf outprefix` produces `outprefix-NN.jpg`.
- ImageMagick `magick montage` / crop on already-rasterized JPEGs works fine — it's only PDF *input* that fails.
- `server/services/salesbook-converter.ts` uses `pdftoppm` to convert the source sales book PDF to page JPEGs.
