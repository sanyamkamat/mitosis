import generate from '@babel/generator';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import { identifier, memberExpression } from '@babel/types';
import { Element as Parse5Element } from 'node_modules/parse5/dist/cjs/tree-adapters/default';
import { createSingleBinding } from '../../helpers/bindings';
import { capitalize } from '../../helpers/capitalize';
import { MitosisComponent } from '../../types/mitosis-component';
import { MitosisNode } from '../../types/mitosis-node';

// Known globals or keywords that should not be prefixed with state.
const KNOWN_GLOBALS = new Set([
  'event', 'console', 'window', 'document', 'Math', 'Date', 'JSON',
  'true', 'false', 'null', 'undefined', 'this', 'state',
  // Add any other known globals/functions used in Alpine expressions
]);

/**
 * Transforms Alpine.js specific expressions to Mitosis compatible ones using Babel.
 * - Replaces `this.` with `state.` (if `this` refers to the component scope)
 * - Replaces `$event` with `event`
 * - Prepends `state.` to variable names unless they are known globals, declared locally (e.g., in a function), or already part of `state.`
 */
export function transformAlpineExpression(code: string): string {
  if (!code || String(code).trim() === '') {
    return '';
  }

  try {
    const ast = parser.parse(code, {
      sourceType: 'module', // or 'script' depending on context, module allows imports/exports if ever needed
      plugins: ['typescript'], // Enable TypeScript syntax if needed in expressions
    });

    traverse(ast, {
      Identifier(path) {
        // Replace $event with event
        if (path.node.name === '$event') {
          path.replaceWith(identifier('event'));
          return; // Skip further processing for this node
        }

        // Check if the identifier is a standalone variable that needs prefixing
        // Avoid prefixing if it's a property of a member expression (e.g., obj.prop)
        // Avoid prefixing if it's a key in an object property (e.g., { key: ... })
        // Avoid prefixing if it's part of a declaration
        // Avoid prefixing if it's a known global or already prefixed
        if (
          !path.findParent((p) => p.isMemberExpression() || p.isObjectProperty({ key: path.node }) || p.isVariableDeclarator() || p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression() || p.isObjectMethod())
          && !KNOWN_GLOBALS.has(path.node.name)
          && !path.scope.hasBinding(path.node.name) // Check if declared in scope
        ) {
          // Avoid prefixing if the parent is already a MemberExpression with 'state' as object
          const parentIsStateMember = path.parentPath.isMemberExpression() && path.parentPath.get('object').isIdentifier({ name: 'state' });
          if (!parentIsStateMember) {
            path.replaceWith(memberExpression(identifier('state'), path.node));
          }
        }
      },
      MemberExpression(path) {
        // Replace this.foo with state.foo
        if (path.get('object').isThisExpression()) {
          path.get('object').replaceWith(identifier('state'));
        }
        // Ensure nested members of state are not re-prefixed, e.g., state.user.name
        // This might be implicitly handled by the Identifier check, but good to be mindful
      },
      // Optional: Add visitors for other node types if needed
    });

    // Generate the transformed code string
    const output = generate(ast, {
      compact: false, // Use false for readability, true for smaller output
      retainLines: false,
      concise: false,
    });

    // Babel generator might add a trailing semicolon for expressions, remove it.
    let finalCode = output.code;
    if (finalCode.endsWith(';')) {
      finalCode = finalCode.slice(0, -1);
    }
     // Handle cases where babel might wrap a simple identifier in ()
    if (finalCode.startsWith('(') && finalCode.endsWith(')')) {
        const inner = finalCode.slice(1, -1);
        if (parser.parse(inner).program.body[0]?.type === 'ExpressionStatement') {
           finalCode = inner;
        }
    }

    return finalCode;

  } catch (error) {
    console.error(`Error transforming Alpine expression with Babel: "${code}"`, error);
    // Fallback to original code or simple replacement in case of Babel error
    return code.replace(/\$event/g, 'event').replace(/this\./g, 'state.');
  }
}

/**
 * Parses an x-data string (expected to be an object literal) into a state object structure
 * suitable for Mitosis, using Babel for safe parsing.
 */
export function parseStateObject(code: string): MitosisComponent['state'] {
  const state: MitosisComponent['state'] = {};
  if (!code || String(code).trim() === '') {
    return state;
  }

  try {
    // Wrap code in parentheses to ensure it's parsed as an expression
    const wrappedCode = `(${code})`;
    const ast = parser.parse(wrappedCode, {
      sourceType: 'script', // x-data is typically not a module
    });

    let rootObject: babel.types.ObjectExpression | null = null;

    // Find the root ObjectExpression
    traverse(ast, {
      ObjectExpression(path) {
        // Assign the first top-level ObjectExpression found
        if (!rootObject && path.parentPath.isExpressionStatement()) {
           rootObject = path.node;
           path.stop(); // Stop traversal once the main object is found
        }
      }
    });

    if (!rootObject) {
      console.warn('Could not find root ObjectExpression in x-data:', code);
      return {}; // Or handle cases where x-data might be a function call returning an object
    }

    // Use non-null assertion (!) on rootObject before accessing properties
    // @ts-ignore
    const properties = rootObject!.properties as Array<
      babel.types.ObjectProperty | babel.types.ObjectMethod | babel.types.SpreadElement
    >;

    // Extract properties from the asserted 'properties' variable
    for (const prop of properties) {
      // Handle ObjectProperty specifically
      if (prop.type === 'ObjectProperty') {
        if (prop.key.type === 'Identifier') { // Only handle simple identifier keys for now
            const key = prop.key.name;
            const valueNode = prop.value;
            let valueString: string | undefined;
            let type: 'property' | 'function' = 'property';

            if (valueNode.type === 'StringLiteral' ||
                valueNode.type === 'NumericLiteral' ||
                valueNode.type === 'BooleanLiteral' ||
                valueNode.type === 'NullLiteral' ||
                valueNode.type === 'ArrayExpression' ||
                valueNode.type === 'ObjectExpression')
            {
                const generateResult = generate(valueNode, { concise: true });
                valueString = generateResult.code;
            } else if (valueNode.type === 'FunctionExpression' || valueNode.type === 'ArrowFunctionExpression') {
                const generateResult = generate(valueNode, { concise: false });
                valueString = generateResult.code;
                type = 'function';
            } else if (valueNode.type === 'Identifier' && valueNode.name === 'undefined') {
                valueString = 'undefined';
            } else {
                console.warn(`Unsupported value type in x-data for key "${key}": ${valueNode.type}`);
                const generateResult = generate(valueNode, { concise: true });
                valueString = generateResult.code;
            }

            if (valueString !== undefined) {
               state[key] = {
                 code: valueString,
                 type: type,
               };
            }
        } else {
            // Handle non-identifier keys (e.g., computed properties) if necessary
            console.warn('Skipping non-identifier key in x-data object property.');
        }
      }
      // Handle ObjectMethod separately
      else if (prop.type === 'ObjectMethod') {
         const key = prop.key.type === 'Identifier' ? prop.key.name : '[computed]';
         if (key !== '[computed]') {
            const generateResult = generate(prop, { concise: false });
            // Attempt a basic conversion from method syntax to function expression string
            let functionCode = generateResult.code.replace(key, 'function ');
            // A more robust conversion might be needed for complex methods
            state[key] = {
                code: functionCode,
                type: 'function'
            };
         }
      }
      // Handle SpreadElement separately
      else if (prop.type === 'SpreadElement') {
          console.warn('Spread elements (...) in x-data are not yet fully supported.');
          // TODO: Implement spread element handling
      }
      // No else needed, as these are the only property types for ObjectExpression
    }

  } catch (error) {
    console.error(`Error parsing x-data expression with Babel: "${code}"`, error);
    // Fallback to empty object on error
    return {};
  }

  return state;
}

/**
 * Parses an x-for expression (e.g., "item in items", "(item, index) in items") using Babel.
 */
export function parseForExpression(expression: string): [string | string[], string] {
  try {
    // Attempt to parse the expression. It should resemble the right side of a `for...of` or `for...in` head.
    // We primarily care about the structure `variable(s) in iterable`
    const ast = parser.parseExpression(expression, {
        plugins: ['typescript'] // Allow potential TS syntax
    });

    if (ast.type === 'BinaryExpression' && ast.operator === 'in') {
      let loopVariable: string | string[];
      const iterableExpression = ast.right;
      const variablePart = ast.left;

      // Handle single variable: item in items
      if (variablePart.type === 'Identifier') {
        loopVariable = variablePart.name;
      } 
      // Handle tuple: (item, index) in items
      else if (variablePart.type === 'SequenceExpression' && variablePart.expressions.length === 2) {
          // Assuming the structure is (Identifier, Identifier) within the sequence
          const first = variablePart.expressions[0];
          const second = variablePart.expressions[1];
          if (first.type === 'Identifier' && second.type === 'Identifier') {
             loopVariable = [first.name, second.name]; 
          } else {
             console.warn('Unexpected structure in x-for tuple:', generate(variablePart).code);
             // Fallback to using the raw string representation for the variable part
             loopVariable = generate(variablePart).code;
          }
      } 
      // Handle parenthesized single variable: (item) in items (less common but possible)
      else if (variablePart.type === 'ParenthesizedExpression' && variablePart.expression.type === 'Identifier') {
          loopVariable = variablePart.expression.name;
      }
      else {
        // Fallback for unexpected structures on the left side
        console.warn('Could not parse x-for variable part:', generate(variablePart).code);
        loopVariable = generate(variablePart).code; // Use generated code as fallback
      }

      // Generate the code for the iterable expression
      const iterableCode = generate(iterableExpression).code;
      
      return [loopVariable, iterableCode];

    } else {
      console.warn('Could not parse x-for expression as BinaryExpression with "in":', expression);
    }

  } catch (error) {
    console.error(`Error parsing x-for expression with Babel: "${expression}"`, error);
  }

  // Fallback to basic regex if Babel parsing fails or structure is unexpected
  const match = expression.trim().match(/^(.*)\s+in\s+(.*)$/);
  if (match) {
    return [match[1].trim(), match[2].trim()];
  }
  console.warn('Defaulting x-for parsing for expression:', expression);
  return ['item', expression]; // Final fallback
}

// Type definition for parse5 element node for convenience

// Update DirectiveHandler type to accept node details
type DirectiveHandler = (
    value: any,
    modifiers: string[], 
    nodeDetails: { 
        tagName: string; 
        typeAttribute: string | undefined; 
        parse5Node: Parse5Element 
    }
) => Partial<MitosisNode>;

// TODO: Implement directive handlers map
export const directiveHandlers: Record<string, DirectiveHandler> = {
  'x-data': (value, modifiers, nodeDetails) => {
    const parsedState = parseStateObject(value);
    return {
      meta: {
        alpineState: parsedState 
      }
    };
  },
  'x-text': (value, modifiers, nodeDetails) => ({
    bindings: {
      _text: createSingleBinding({
        code: transformAlpineExpression(value),
      }),
    },
  }),
  'x-bind': (value, modifiers, nodeDetails) => {
    const attributeName = modifiers[0];
    if (!attributeName) {
        console.warn('x-bind directive used without specifying an attribute name.');
        return {};
    }
    const expressionCode = transformAlpineExpression(value);
    if (attributeName === 'class') {
       return {
            bindings: {
                class: createSingleBinding({ code: expressionCode }),
            }
        };
    }
    if (attributeName === 'style') {
         return {
            bindings: {
                 style: createSingleBinding({ code: expressionCode }),
            }
        };
    }
    return {
      bindings: {
        [attributeName]: createSingleBinding({
          code: expressionCode,
        }),
      }
    };
  },
  'x-on': (value, modifiers, nodeDetails) => {
    const eventName = modifiers[0] || 'click';
    const actualModifiers = modifiers.slice(1);
    let handlerCode = transformAlpineExpression(value);
    let prependedCode = '';
    if (actualModifiers.includes('prevent')) {
      prependedCode += 'event.preventDefault();\n';
    }
    if (actualModifiers.includes('stop')) {
      prependedCode += 'event.stopPropagation();\n';
    }
    const finalHandlerCode = prependedCode ? `${prependedCode}${handlerCode}` : handlerCode;
    return {
      bindings: {
        [`on${capitalize(eventName)}`]: createSingleBinding({
          code: finalHandlerCode,
        }),
      }
    };
  },
  'x-if': (value, modifiers, nodeDetails) => {
    return {
        name: 'Show',
        bindings: {
          when: createSingleBinding({ code: transformAlpineExpression(value) })
        }
    };
  },
  'x-for': (value, modifiers, nodeDetails) => {
    const [loopVar, iterableName] = parseForExpression(value);
    // Use Partial to allow assigning optional properties
    let forScope: Partial<MitosisNode['scope'] & { forName?: string, indexName?: string }> = {}; 

    if (Array.isArray(loopVar)) {
        if (loopVar.length > 0) {
            forScope.forName = loopVar[0]; // Assign directly
        }
        if (loopVar.length > 1) {
            forScope.indexName = loopVar[1]; // Assign directly
        }
    } else {
        forScope.forName = loopVar; // Assign directly
    }
    
    // Only assign scope if it has properties
    const finalScope = Object.keys(forScope).length > 0 ? forScope as MitosisNode['scope'] : undefined;

    return {
        name: 'For',
        bindings: {
          each: createSingleBinding({ code: transformAlpineExpression(iterableName) })
        },
        scope: finalScope, // Assign final scope object or undefined
    };
  },
  'x-model': (value, modifiers, nodeDetails) => {
    const propertyName = transformAlpineExpression(value);
    const { tagName, typeAttribute } = nodeDetails;

    // Checkbox
    if (tagName === 'input' && typeAttribute === 'checkbox') {
      // TODO: Handle checkbox groups (binding to array)
      return {
        bindings: {
          checked: createSingleBinding({ code: propertyName }),
          onChange: createSingleBinding({
            code: `${propertyName} = event.target.checked`,
            arguments: ['event'],
          }),
        }
      };
    }

    // Radio button
    if (tagName === 'input' && typeAttribute === 'radio') {
      // Assumes radio group shares the same x-model propertyName
      // Need the actual 'value' attribute of the radio button itself
      const radioValueAttr = nodeDetails.parse5Node.attrs.find((a: { name: string; value: string; }) => a.name === 'value')?.value || '' ;
      const radioValueCode = `'${radioValueAttr}'`; // Assuming string value

      return {
        bindings: {
          checked: createSingleBinding({
             // Checked if the bound state property matches this radio's value
            code: `${propertyName} === ${radioValueCode}` 
          }),
          onChange: createSingleBinding({
            code: `${propertyName} = ${radioValueCode}`,
            arguments: ['event'], // Event might not be strictly needed here
          }),
        }
      };
    }

    // Select (basic)
    if (tagName === 'select') {
        // TODO: Handle multiple select
        return {
            bindings: {
                value: createSingleBinding({ code: propertyName }),
                onChange: createSingleBinding({
                    code: `${propertyName} = event.target.value`,
                    arguments: ['event'],
                }),
            }
        };
    }
    
    // Default: Text input, Textarea, etc.
    return {
      bindings: {
        value: createSingleBinding({ code: propertyName }),
        onChange: createSingleBinding({
          code: `${propertyName} = event.target.value`,
          arguments: ['event'],
        }),
      }
    };
  },
  'x-show': (value, modifiers, nodeDetails) => ({
    bindings: {
      show: createSingleBinding({
        code: transformAlpineExpression(value),
      }),
    },
  }),
  'x-html': (value, modifiers, nodeDetails) => ({
    bindings: {
      innerHTML: createSingleBinding({
        code: transformAlpineExpression(value),
      }),
    },
  }),
  'x-ref': (value, modifiers, nodeDetails) => ({
    bindings: {
      ref: createSingleBinding({ code: `'${value}'` }), 
    },
  }),
  'x-init': (value, modifiers, nodeDetails) => ({
    bindings: {
      onMount: createSingleBinding({
        code: transformAlpineExpression(value), 
      }),
    },
  }),
  // TODO: Add handlers for x-transition, x-effect, etc.
}; 