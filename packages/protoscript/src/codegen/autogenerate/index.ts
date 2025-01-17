/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-explicit-any */
import { type FileDescriptorProto } from "google-protobuf/google/protobuf/descriptor_pb.js";
import { type UserConfig } from "../../cli/core.js";
import { type Plugin } from "../../plugin.js";
import {
  IdentifierTable,
  ProtoTypes,
  cycleDetected,
  processTypes,
  // uniqueBy,
} from "../utils.js";
import { SNAKE } from "@3-/snake";

function writeTypes(types: ProtoTypes[], parents: string[]): string {
  let result = "";
  // const isTopLevel = parents.length === 0;

  types.forEach((node) => {
    const name = node.content.name;
    if (node.content.comments?.leading) {
      result += printComments(node.content.comments.leading);
    }
    if (node.type === "enum") {
      result += `export type ${name} = ${node.content.values
        .map((x) => `| '${x.name}'`)
        .join("\n")}\n\n`;
    } else {
      result += `${printIf(
        !node.content.isMap,
        "export ",
      )}interface ${name} {\n`;
      node.content.fields.forEach(
        ({ name: fieldName, tsType, repeated, optional, comments, map }) => {
          if (comments?.leading) {
            result += printComments(comments.leading);
          }

          const mandatoryOptional = cycleDetected(tsType, [...parents, name]);

          result += `${fieldName}${printIf(optional, "?")}:`;
          if (map) {
            result += `Record<string, ${tsType}['value'] | undefined>`;
          } else {
            result += tsType;
            if (repeated) {
              result += "[]";
            } else if (optional || mandatoryOptional) {
              result += "| null | undefined";
            }
          }

          result += ";\n";
        },
      );
      result += "}\n\n";

      if (node.children.length > 0) {
        // result += `${printIf(
        //   isTopLevel,
        //   "export declare",
        // )} namespace ${name} { \n`;
        result += writeTypes(node.children, [...parents, name]) + "\n\n";
        result += `}\n\n`;
      }
    }
  });

  return result;
}

// const toMapMessage = (name: string) =>
//   `Object.entries(${name}).map(([key, value]) => ({ key: key ${printIfTypescript(
//     "as any",
//   )}, value: value ${printIfTypescript("as any")} }))`;

function writeProtobufSerializers(
  types: ProtoTypes[],
  parents: string[],
): string {
  let result = "";
  // const isTopLevel = parents.length === 0;

  types.forEach((node) => {
    const ns = node.content.namespacedName,
      name = node.content.name;
    // result += isTopLevel ? `export const ${name} = {` : `${name}: {`;

    switch (node.type) {
      case "message": {
        const node_len = node.content.fields.length;
        const isEmpty = node_len === 0;
        const is_array = node_len > 1;

        if (!node.content.isMap) {
          // encode (protobuf)
          result += `
/**
* Serializes ${ns} to protobuf.
*/
`;
          if (isEmpty) {
            result += `export const ${name}Encode = (_msg${printIfTypescript(
              `?: PartialDeep<${ns}>`,
            )})${printIfTypescript(`: Uint8Array`)} => new Uint8Array()`;
          } else {
            result += `export const ${name}Encode = (msg${printIfTypescript(
              `: PartialDeep<${ns}>`,
            )})${printIfTypescript(`: Uint8Array`)} => _P.getResultBuffer(${
              ns
            }Write(msg, _P.binaryWriter()))`;
          }

          // decode (protobuf)
          result += `
/**
* Deserializes ${ns} from protobuf.
*/
`;
          if (isEmpty) {
            result += `export const ${name}Decode = (_bytes${printIfTypescript(
              `?: ByteSource`,
            )})${printIfTypescript(`: ${ns}`)} => {}`;
          } else {
            result += `export const ${name}Decode = (bytes${printIfTypescript(
              `: ByteSource`,
            )})${printIfTypescript(`: ${ns}`)} => ${ns}Read(${
              ns
            }New(), _P.binaryReader(bytes))`;
          }

          // initialize
          result += `
const ${ns}New = () => `;
          const node_len = node.content.fields.length;
          if (node_len) {
            if (is_array) {
              result += "[";
            }

            result += node.content.fields
              .map((field) => {
                if (field.optional) {
                  // return `${field.name}: undefined,`;
                  return "";
                }
                if (field.repeated) {
                  return "[]";
                  // return `${field.name}: [],`;
                } else if (field.read === "readMessage" && !field.map) {
                  if (cycleDetected(field.tsType, [...parents, name])) {
                    return "";
                    // return `${field.name}: undefined,`;
                  } else {
                    return `${field.tsType}New()`;
                    // return `${field.name}: ${field.tsType}New(),`;
                  }
                } else {
                  return `${field.defaultValue}`;
                  // return `${field.name}: ${field.defaultValue},`;
                }
              })
              .join(",");
            if (is_array) {
              result += "]";
            }
          } else {
            result += "{}";
          }
          result += "\n";
        }

        const pos_li: string[] = [];
        const func_li: string[] = [];

        let need_pos_li = false;

        result += `const ${ns}Write = _P.`;

        for (const field of node.content.fields) {
          const write = field.write;
          let func = "_P." + write;
          if (write == "writeRepeatedMessage") {
            func += `(${field.tsType}Write)`;
          }
          func_li.push(func);
          if (field.index != pos_li.length + 1) {
            need_pos_li = true;
            pos_li.push(field.index + "");
          } else {
            pos_li.push("");
          }
        }

        const func_li_str = func_li.join(",");

        if (is_array) {
          result += need_pos_li
            ? `encoderWithPos([${func_li_str}],[${pos_li.join(",")}])`
            : `encoder(${func_li_str})`;
        } else {
          result += `encoder1(${func_li_str}`;
          if (need_pos_li) {
            result += `, ${pos_li[0]}`;
          }
          result += ")";
        }

        result += "\n";

        // private: encode (protobuf)
        //         result += `
        // const ${ns}Write = (${printIf(isEmpty, "_")}msg${printIfTypescript(
        //           `: ${`PartialDeep<${ns}>`}`,
        //         )}, writer${printIfTypescript(
        //           `: _P.BinaryWriter`,
        //         )})${printIfTypescript(`: _P.BinaryWriter`)} => {
        //           ${node.content.fields
        //             .map((field, pos) => {
        //               const msg_pos = is_array ? `msg[${pos}]` : "msg";
        //               let res = "";
        //               // if (field.repeated || field.read === "readBytes") {
        //               //   res += `if (${msg_pos}?.length) {`;
        //               // } else if (field.optional) {
        //               //   res += `if (${msg_pos} != undefined) {`;
        //               // }
        //               // // else if (field.read === "readEnum") {
        //               // //   res += `if (${msg_pos} && ${field.tsType}._toInt(${msg_pos})) {`;
        //               // // }
        //               // else {
        //               //   res += `if (${msg_pos}) {`;
        //               // }
        //
        //               if (field.read === "readMessage") {
        //                 func_li.push(field.write);
        //               } else {
        //                 res += `_P.${field.write}(writer,${field.index}, `;
        //                 if (field.tsType === "bigint") {
        //                   if (field.repeated) {
        //                     res += `msg.${
        //                       field.name
        //                     }.map(x => x.toString() ${printIfTypescript("as any")})`;
        //                   } else {
        //                     res += `${msg_pos}.toString() ${printIfTypescript(
        //                       "as any",
        //                     )}`;
        //                   }
        //                 }
        //                 // else if (field.read === "readEnum") {
        //                 //   if (field.repeated) {
        //                 //     res += `${msg_pos}.map(${field.tsType}._toInt)`;
        //                 //   } else {
        //                 //     res += `${field.tsType}._toInt(${msg_pos})`;
        //                 //   }
        //                 // }
        //                 else {
        //                   res += `${msg_pos}`;
        //                 }
        //                 res += ");";
        //               }
        //
        //               // res += "}";
        //               return res;
        //             })
        //             .join("\n")}
        //             return writer;`;
        //         result += "}\n\n";

        // private: decode (protobuf)
        if (isEmpty) {
          result += `const ${name}Read = (_msg${printIfTypescript(
            `: ${`${ns}`}`,
          )}, Reader${printIfTypescript(
            `: _P.BinaryReader`,
          )})${printIfTypescript(`: ${`${ns}`}`)} => {
            return _msg;`;
        } else {
          result += `const ${name}Read = (msg${printIfTypescript(
            `: ${`${ns}`}`,
          )}, reader${printIfTypescript(
            `: _P.BinaryReader`,
          )})${printIfTypescript(`: ${`${ns}`}`)} => {`;
          result += `while (_P.nextField(reader)) {
              switch (_P.getFieldNumber(reader)) {
                ${node.content.fields
                  .map((field, pos) => {
                    const msg_pos = is_array ? "msg[" + pos + "]" : "msg";
                    let res = "";
                    res += `case ${field.index}: {`;
                    if (field.read === "readMessage") {
                      if (field.map) {
                        res += `
                        const map = {}${printIfTypescript(
                          ` as ${field.tsType}`,
                        )};
                        _P.readMessage(reader,map, ${field.tsType}Read);
                        ${msg_pos}[map.key${printIf(
                          field.tsType !== "string",
                          ".toString()",
                        )}] = map.value;
                      `;
                      } else if (field.repeated) {
                        res += `const m = ${field.tsType}New();`;
                        res += `_P.readMessage(reader, m, ${field.tsType}Read);`;
                        res += `${msg_pos}.push(m);`;
                      } else {
                        if (
                          field.optional ||
                          node.content.isMap ||
                          cycleDetected(field.tsType, [...parents, name])
                        ) {
                          res += `${msg_pos} = ${field.tsType}New();`;
                        }
                        res += `_P.readMessage(reader,${msg_pos}, ${field.tsType}Read);`;
                      }
                    } else {
                      let converter;
                      // if (field.read === "readEnum") {
                      // converter = `${field.tsType}._fromInt`;
                      // } else
                      if (field.tsType === "bigint") {
                        converter = "BigInt";
                      }
                      if (field.repeated) {
                        if (converter) {
                          if (field.readPacked) {
                            res += `if (_P.isDelimited(reader)) {`;
                            res += `${msg_pos}.push(..._P.${field.readPacked}(reader).map(${converter}));`;
                            res += `} else {`;
                            res += `${msg_pos}.push(${converter}(_P.${field.read}(reader)));`;
                            res += `}`;
                          } else {
                            res += `${msg_pos}.push(${converter}(_P.${field.read}(reader)));`;
                          }
                        } else {
                          if (field.readPacked) {
                            res += `if (_P.isDelimited(reader)) {`;
                            res += `${msg_pos}.push(..._P.${field.readPacked}(reader));`;
                            res += `} else {`;
                            res += `${msg_pos}.push(_P.${field.read}(reader));`;
                            res += `}`;
                          } else {
                            res += `${msg_pos}.push(_P.${field.read}(reader));`;
                          }
                        }
                      } else {
                        if (converter) {
                          res += `${msg_pos} = ${converter}(_P.${field.read}(reader));`;
                        } else {
                          res += `${msg_pos} = _P.${field.read}(reader);`;
                        }
                      }
                    }
                    res += "break;\n}";
                    return res;
                  })
                  .join("\n")}
                default: {
                  _P.skipField(reader);
                  break;
                }
              }
            }
            return msg;`;
        }
        result += "\n}";
        result += writeProtobufSerializers(node.children, [...parents, name]);
        // result += `}${isTopLevel ? ";" : ","}\n\n`;
        break;
      }

      case "enum": {
        const node_name = SNAKE(node.content.name);
        // constant map
        node.content.values.forEach(({ name, comments, value }) => {
          if (comments?.leading) {
            result += printComments(comments.leading);
          }
          result += `export const ${node_name}_${SNAKE(name)} = ${value};\n`;
        });
        // // to enum
        // result += `\
        // /**
        //  * @private
        //  */
        // _fromInt: `;
        // result += `function(i${printIfTypescript(
        //   ": number",
        // )})${printIfTypescript(`: ${ns}`)} => {
        //   switch (i) {
        // `;
        // // Though all alias values are valid during deserialization, the first value is always used when serializing
        // // https://protobuf.dev/programming-guides/proto3/#enum
        // uniqueBy(node.content.values, (x) => x.value).forEach(
        //   ({ name, value }) => {
        //     result += `case ${value}: { return '${name}'; }\n`;
        //   },
        // );
        //
        // result += `// unknown values are preserved as numbers. this occurs when new enum values are introduced and the generated code is out of date.
        // default: { return i${printIfTypescript(
        //   ` as unknown as ${ns}`,
        // )}; }\n }\n },\n`;
        //
        // // from enum
        // result += `\
        // /**
        //  * @private
        //  */
        // _toInt: `;
        // result += `function(i${printIfTypescript(
        //   `: ${ns}`,
        // )})${printIfTypescript(`: number`)} => {
        //   switch (i) {
        // `;
        // node.content.values.forEach(({ name, value }) => {
        //   result += `case '${name}': { return ${value}; }\n`;
        // });
        //
        // result += `// unknown values are preserved as numbers. this occurs when new enum values are introduced and the generated code is out of date.
        // default: { return i${printIfTypescript(
        //   ` as unknown as number`,
        // )}; }\n }\n },\n`;

        // result += `} ${printIfTypescript("as const")}${
        //   isTopLevel ? ";" : ","
        // }\n\n`;

        break;
      }
      default: {
        const _exhaust: never = node;
        return _exhaust;
      }
    }
  });
  return result;
}

/**
 * Escapes '*''/' which otherwise would terminate the block comment.
 */
function escapeComment(comment: string): string {
  return comment.replace(/\*\//g, "*" + "\\" + "/");
}

export function printComments(comment: string): string {
  const lines = escapeComment(comment)
    .split("\n")
    .map((i) => (i.startsWith("/") ? i.slice(1) : i));
  return `\
    /**
     *${lines.slice(0, -1).join("\n *") + lines.slice(-1).join(" *")}
     */
      `;
}

export function printHeading(heading: string): string {
  const width = Math.max(40, heading.length + 2);
  const padding = (width - heading.length) / 2;
  return `\
  //${"=".repeat(width)}//
  //${" ".repeat(Math.floor(padding))}${heading}${" ".repeat(
    Math.ceil(padding),
  )}//
  //${"=".repeat(width)}//
  
  `;
}

let config = {
  isTS: false,
  json: {
    emitFieldsWithDefaultValues: false,
    useProtoFieldName: false,
  },
  typescript: {
    emitDeclarationOnly: false,
  },
};

export type Config = typeof config;

export function printIfTypescript(str: string): string {
  return printIf(config.isTS, str);
}

function printIf(cond: boolean, str: string): string {
  return cond ? str : "";
}

export function generate(
  fileDescriptorProto: FileDescriptorProto,
  identifierTable: IdentifierTable,
  options: Pick<UserConfig, "language" | "json" | "typescript">,
  plugins: Plugin[],
): string {
  config = {
    isTS: options.language === "typescript",
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    json: options.json as any,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    typescript: options.typescript as any,
  };

  const ast = processTypes(fileDescriptorProto, identifierTable, config.isTS);
  const { imports, types } = ast;
  const sourceFile = fileDescriptorProto.getName();
  if (!sourceFile) {
    return "";
  }

  const plugs = plugins.map((plugin) => plugin({ ast, config }));
  const pluginImports = plugs.map((p) => p?.imports).filter(Boolean);
  const pluginServices = plugs.map((p) => p?.services).filter(Boolean);

  const hasTypes = types.length > 0;
  const hasSerializer =
    !config.typescript.emitDeclarationOnly &&
    !!types.find((x) => x.type === "message");

  const typeDefinitions = hasTypes && config.isTS ? writeTypes(types, []) : "";

  const protobufSerializers = !config.typescript.emitDeclarationOnly
    ? writeProtobufSerializers(types, [])
    : "";

  // const jsonSerializers = !config.typescript.emitDeclarationOnly
  //   ? writeJSONSerializers(types, [])
  //   : "";

  const hasWellKnownTypeImports = imports.some(
    ({ moduleName }) => moduleName === "_P",
  );

  return `\
// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
// Source: ${sourceFile}
/* eslint-disable */

${printIf(
  config.isTS && hasSerializer,
  `import type { ByteSource, PartialDeep } from "_P";`,
)}
${printIf(
  hasSerializer || hasWellKnownTypeImports,
  'import * as _P from "@3-/protoscript";',
)}
${printIf(pluginImports.length > 0, pluginImports.join("\n"))}
${imports
  .filter(({ moduleName }) => moduleName !== "_P")
  .map(({ moduleName, path }) => {
    return `import * as ${moduleName} from '${path}';`;
  })
  .join("\n")}

${printIf(
  !!typeDefinitions,
  `${printIfTypescript(printHeading("Types"))}
${typeDefinitions}`,
)}
${printIf(pluginServices.length > 0, pluginServices.join("\n"))}
${printIf(
  !!protobufSerializers,
  `${printHeading("Protobuf Encode / Decode")}
${protobufSerializers}
`,
)}
`;
  // ${jsonSerializers}
}
