# ISBN range data

`groups.mjs` is the `lib/groups.js` file from [isbn3](https://github.com/inventaire/isbn3), npm version **2.0.12**, with `module.exports =` changed to `export default` for native browser ES Modules. No ranges were changed. Its MIT license is retained in `LICENSE`.

The data is bundled locally so formatting also works without an external API or CDN. When updating, obtain a reviewed isbn3 release from npm, replace this data and its license, apply the same ES module conversion, update this version note, and run `npm test` and `npm run build`.
