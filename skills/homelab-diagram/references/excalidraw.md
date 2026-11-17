# Excalidraw Export

`to_excalidraw.py` turns a rendered SVG into an editable `.excalidraw` scene.

```bash
uv run --no-project --with-requirements requirements.txt python to_excalidraw.py out/diagram-unredacted.svg
```

It writes `out/diagram-unredacted.excalidraw` next to the SVG. Icons are
embedded as files in the scene.

## What Changes

- Every rectangle, text, line, and icon becomes its own element. Cards are not
  grouped and cables are not bound to cards: moving a card leaves its text and
  cables behind.
- Text uses Excalidraw fonts (Nunito, Cascadia) and loses bold. Text boxes are
  padded so the wider fonts do not clip.
- Curves are flattened into polylines; roughness is 0.
- The dark background becomes the scene background. Open the file in
  Excalidraw's light theme; its dark theme inverts every color.

## Verify

Open the file in excalidraw.com by dragging it onto the canvas or with the
Open menu, zoom to fit, and zoom into a dense area to check that no text is
clipped. Loading a file keeps it in the browser; do not press Share or start
live collaboration for internal diagrams, because that uploads the scene.
