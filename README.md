# ProtoScript

<blockquote>A Protobuf runtime and code generation tool for JavaScript and TypeScript</blockquote>

<br />

<a href="https://www.npmjs.com/package/protoscript">
  <img src="https://img.shields.io/npm/v/protoscript.svg">
</a>
<a href="https://github.com/tatethurston/protoscript/blob/main/LICENSE">
  <img src="https://img.shields.io/npm/l/protoscript.svg">
</a>
<a href="https://bundlephobia.com/result?p=protoscript">
  <img src="https://img.shields.io/bundlephobia/minzip/protoscript">
</a>
<a href="https://www.npmjs.com/package/protoscript">
  <img src="https://img.shields.io/npm/dy/protoscript.svg">
</a>
<a href="https://github.com/tatethurston/protoscript/actions/workflows/ci.yml">
  <img src="https://github.com/tatethurston/protoscript/actions/workflows/ci.yml/badge.svg">
</a>
<a href="https://codecov.io/gh/tatethurston/protoscript">
  <img src="https://img.shields.io/codecov/c/github/tatethurston/protoscript/main.svg?style=flat-square">
</a>

## What is this? 🧐

ProtoScript is a [protocol buffers](https://developers.google.com/protocol-buffers/) runtime and code generation tool for JavaScript, written in TypeScript.

ProtoScript consists of two parts:

1. Runtime. This is nearly identical to [google-protobuf](https://www.npmjs.com/package/google-protobuf), but significantly smaller (9.6KB vs 46KB gzipped) and written in ESM to enable dead-code elimination. If you only use the generated JSON serializers, the protobuf runtime will be eliminated from the final build, resulting in a substantially smaller runtime.

2. Code generation. This is a replacement of `protoc`'s JavaScript generation that generates idiomatic JavaScript code, JSON serializers/deserializers, and includes TSDoc comments.

If you're looking for an RPC framework, you may be interested in [TwirpScript](https://github.com/tatethurston/TwirpScript).

## Highlights 🛠

1. Idiomatic JavaScript / TypeScript code. None of the Java idioms that `protoc --js_out` generates such as the `List` suffix naming for repeated fields, `Map` suffix for maps, or the various getter and setter methods. ProtoScript generates and consumes plain JavaScript objects over classes. Compare the [TypeScript example](https://github.com/tatethurston/ProtoScript/blob/main/examples/typescript/src/haberdasher.pb.ts) to the [protoc example](https://github.com/tatethurston/ProtoScript/blob/main/examples/protoc/src/haberdasher_pb.js).

2. In-editor API documentation. Comments in your `.proto` files become [TSDoc](https://github.com/microsoft/tsdoc) comments in the generated code and will show inline documentation in supported editors.

3. JSON Serialization/Deserialization. Unlike `protoc`, ProtoScript's code generation also generates JSON serialization and deserialization methods.

4. Small. ProtoScript's runtime and generated code are built with [tree shaking](https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking) to minimize bundle sizes. This results in a significantly smaller bundle size than [google-protobuf](https://www.npmjs.com/package/google-protobuf). ProtoScript's runtime is 67KB (9.6KB gzipped) compared to google-protobuf's 231KB (46KB gzipped). If you only use the generated JSON serializers, the protobuf runtime will be eliminated from the final build, resulting in a substantially smaller runtime.

5. Isomorphic. ProtoScript's generated serializers/deserializers can be consumed in the browser or Node.js runtimes.

6. No additional runtime dependencies.

## Interface Examples

If you have the following protobuf defined in `user.pb`:

```protobuf
message User {
  string first_name = 1;
  string last_name = 2;
  bool active = 3;
  User manager = 4;
  repeated string locations = 5;
  map<string, string> projects = 6;
}
```

Using the generated `User` from ProtoScript will look like this:

```typescript
import { User, UserJSON } from "./user.pb.js";

let user: User;

// protocol buffers
const bytes = User.encode({
  firstName: "Homer",
  lastName: "Simpson",
  active: true,
  locations: ["Springfield"],
  projects: { SPP: "Springfield Power Plant" },
  manager: {
    firstName: "Montgomery",
    lastName: "Burns",
  },
});
console.log(bytes);

user = User.decode(bytes);
console.log(user)

// json
const json = UserJSON.encode({
  firstName: "Homer",
  lastName: "Simpson",
  active: true,
  locations: ["Springfield"],
  projects: { SPP: "Springfield Power Plant" },
  manager: {
    firstName: "Montgomery",
    lastName: "Burns",
  },
});
console.log(json)

user = UserJSON.decode(json);
console.log(user);

// ProtoScript generates and consumes plain JavaScript objects (POJOs) over classes. If you want to generate a full message
// with default fields, you can use the #initialize method on the generated message class:

user = User.initialize();
console.log(user); 
```

## Installation 📦

1. Install the [protocol buffers compiler](https://developers.google.com/protocol-buffers):

   MacOS:
   `brew install protobuf`

   Linux:
   `apt install -y protobuf-compiler`

   Windows:
   `choco install protoc`

   Or install from a [precompiled binary](https://github.com/protocolbuffers/protobuf/releases).

1. Add this package to your project:
   `npm install protoscript` or `yarn add protoscript`

## Requirements ⚠️

- Node.js v16 or greater
- TypeScript v4.7 or greater when using TypeScript

## Examples 🚀

### npx

```sh
npx protoscript
```

### cli

```sh
protoc \
  --plugin=protoc-gen-protoscript=./node_modules/protoscript/compiler.js
  --protoscript_out=. \
  --protoscript_opt=language=typescript \
```

Note: Windows users replace `./node_modules/protoscript/compiler.js` above with `./node_modules/protoscript/compiler.cmd`

### Buf

ProtoScript can be used with [Buf](https://docs.buf.build/introduction).

`buf.gen.yaml`

```
version: v1
plugins:
  - name: protoc-gen-protoscript
    path: ./node_modules/protoscript/compiler.js
    out: .
    opt:
      - language=typescript
    strategy: all
```

## Working with other tools

### TypeScript

As a design goal, ProtoScript should always work with the strictest TypeScript compiler settings. If your generated ProtoScript files are failing type checking, please open an issue.

### Linters

ProtoScript does not make any guarantees for tools like linters and formatters such as [prettier](https://prettier.io/) or [eslint](https://eslint.org/). It generally does not make sense to run these tools against code generation artifacts, like the `.pb.ts` or `.pb.js` files generated by ProtoScript. This is because:

1. The permutations of preferences and plugins for these tools quickly explode beyond what is feasible for a single tool to target. There are always new tools that could be added as well.
2. The code is generated automatically, and not all rules are auto fixable. This means there are cases that would always require manual intervention by the user.
3. Autogenerated code is readonly, and expected to be correct. Autogenerated code has a much difference maintenance cycle than code written by hand, and should generally be treated as a binary or a dependency. You don't lint your node_modules!

## Configuration 🛠

ProtoScript aims to be zero config, but can be configured via the cli interface, or when using the `npx protoscript` command, by creating a `proto.config.mjs` (or `.js` or `.cjs`) file in your project root.

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Description</th>
      <th>Type</th>
    </tr>
  </thead>
  <tbody>
<tr>
  <td>root</td>
<td>
  The root directory. `.proto` files will be searched under this directory, and `proto` import paths will be resolved relative to this directory. ProtoScript will recursively search all subdirectories for `.proto` files.
 
  Defaults to the project root.
 
  Example:
 
  If we have the following project structure:
 
  ```
  /src
    A.proto
    B.proto
  ```
 
  Default:
 
  A.proto would `import` B.proto as follows:
 
  ```protobuf
  import "src/B.proto";
  ```
 
  Setting `root` to `src`:

// proto.config.mjs

```js
/** @type {import('protoscript').Config} */
export default {
  root: "src",
};
```

A.proto would `import` B.proto as follows:

```protobuf
import "B.proto";
```

TypeScript projects will generally want to set this value to match their `rootDir`, particularly when using [Protocol Buffers Well-Known Types](https://developers.google.com/protocol-buffers/docs/reference/google.protobuf) so that the generated well-known type files are under the `rootDir`.

</td>
<td>string (filepath)</td>
</tr>
<tr>
  <td>exclude</td>
<td>
   An array of patterns that should be skipped when searching for `.proto` files.
  
   Example:
  
   If we have the following project structure:
   /src
     /foo
       A.proto
     /bar
       B.proto
  
   Setting `exclude` to `["/bar/"]`:
  
   // proto.config.mjs
   ```js
   /** @type {import('protoscript').Config} */
   export default {
     exclude: ["/bar/"]
   }
   ```
  
   Will only process A.proto (B.proto) will be excluded from ProtoScript's code generation.
</td>
  <td>string[] (RegExp pattern)</td>
</tr>
<tr>
  <td>dest</td>
<td>
  The destination folder for generated files.
   
  Defaults to colocating generated files with the corresponding `proto` definition.
   
  If we have the following project structure:
 
  ```
  /src
    A.proto
    B.proto
  ```
 
  ProtoScript will generate the following:
 
  ```
  /src
    A.proto
    A.pb.ts
    B.proto
    B.pb.ts
  ```
 
  Setting `dest` to `out` will generate the following:
 
  // proto.config.mjs
  ```js
  /** @type {import('protoscript').Config} */
  export default {
    dest: "out",
  }
  ```
 
  ```
  /src
    A.proto
    B.proto
  /out
    /src
      A.pb.ts
      B.pb.ts
  ```
  
  Note that the generated directory structure will mirror the `proto` paths exactly as is, only nested under the `dest` directory. If you want to change this, for instance, to omit `src` from the `out` directory above, you can set the `root`.
  
  Setting `root` to `src` (in addition to setting `dest` to `out`) will generate the following:
 
  // proto.config.mjs
  ```js
  /** @type {import('protoscript').Config} */
  export default {
    root: "src",
    dest: "out",
  }
  ```
  
  ```
  /src
    A.proto
    B.proto
  /out
    A.pb.ts
    B.pb.ts
  ```
</td>
  <td>string (filepath)</td>
</tr>
<tr>
  <td>language</td>
<td>
  Whether to generate JavaScript or TypeScript.
  
  If omitted, ProtoScript will attempt to autodetect the language by looking for a `tsconfig.json` in the project root. If found, ProtoScript will generate TypeScript, otherwise JavaScript.
</td>
  <td>javascript | typescript</td>
</tr>
<tr>
  <td>json</td>
<td>
  JSON serializer options.
   
  `emitFieldsWithDefaultValues` - Fields with default values are omitted by default in proto3 JSON. Setting this to true will serialize fields with their default values.
      
  `useProtoFieldName` - Field names are converted to lowerCamelCase by default in proto3 JSON. Setting this to true will use the proto field name as the JSON key when serializing JSON. Either way, Proto3 JSON parsers are required to accept both the converted lowerCamelCase name and the proto field name.
  
  
  See https://developers.google.com/protocol-buffers/docs/proto3#json for more context.
</td>
  <td>{ emitFieldsWithDefaultValues?: boolean, useProtoFieldName?: boolean }</td>
</tr>
<tr>
  <td>typecript</td>
<td>
  TypeScript options.
  
  `emitDeclarationOnly` - Only emit TypeScript type definitions.
</td>
  <td>{ emitDeclarationOnly?: boolean }</td>
</tr>
</tbody>
</table>

## JSON

ProtoScript's JSON serialization/deserialization implements the [proto3 specification](https://developers.google.com/protocol-buffers/docs/proto3#json). If you find a discrepancy, please open an issue.

ProtoScript will serialize JSON keys as `lowerCamelCase` versions of the proto field. Per the proto3 spec, the runtime will accept both `lowerCamelCase` and the original proto field name when deserializing. You can provide the `json_name` field option to specify an alternate key name. When doing so, the runtime will encode JSON messages using the the `json_name` as the key, and will decode JSON messages using the `json_name` if present, otherwise falling back to the `lowerCamelCase` name and finally to the original proto field name.

## Contributing 👫

PR's and issues welcomed! For more guidance check out [CONTRIBUTING.md](https://github.com/tatethurston/protoscript/blob/main/CONTRIBUTING.md)

## Licensing 📃

See the project's [MIT License](https://github.com/tatethurston/protoscript/blob/main/LICENSE).
