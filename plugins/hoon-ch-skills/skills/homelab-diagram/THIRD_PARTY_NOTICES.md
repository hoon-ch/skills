# Third-party notices

The homelab-diagram skill adapts the rendering approach of Goblinmine/homelab-diagram:
the dark r/homelab card style, folder-tab device cards, port VLAN ticks, line width as
link speed, and the trunk cable look. `scripts/hd.py` is a parameterised rewrite of its
`build.py` primitives, and `assets/glyphs/glyph-*.svg` are copied unchanged.

Source: <https://github.com/Goblinmine/homelab-diagram>

```text
MIT License

Copyright (c) 2026 Goblinmine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Service icons

`scripts/fetch_icons.py` downloads icons from homarr-labs/dashboard-icons at use time.
They are not bundled; each logo belongs to its project.

Source: <https://github.com/homarr-labs/dashboard-icons>
