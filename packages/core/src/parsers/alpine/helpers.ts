import generate from '@babel/generator';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import { identifier, memberExpression } from '@babel/types';
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
          path.replaceWith(memberExpression(identifier('state'), path.node));
        }
      },
      MemberExpression(path) {
        // Replace this.foo with state.foo
        if (path.get('object').isThisExpression()) {
          path.get('object').replaceWith(identifier('state'));
        }
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

    return finalCode;

  } catch (error) {
    console.error(`Error transforming Alpine expression with Babel: "${code}"`, error);
    // Fallback to original code or simple replacement in case of Babel error
    return code.replace(/\$event/g, 'event').replace(/this\./g, 'state.');
  }
}

/**
 * Parses an x-data string into a state object.
 * VERY basic implementation, assumes a simple JSON-like object string.
 * Needs robust error handling and support for functions.
 */
export function parseStateObject(code: string): Record<string, any> {
  try {
    // Attempt to evaluate the expression within a restricted context
    // WARNING: This is potentially unsafe and should be replaced with a proper parser
    // or sandbox if handling untrusted input.
    // Using Function constructor for slightly safer eval than direct eval().
    const evaluated = new Function(`return (${code})`)();
    if (typeof evaluated === 'object' && evaluated !== null) {
      return evaluated;
    } else {
      console.warn('x-data did not evaluate to an object:', code);
      return {};
    }
  } catch (e) {
    console.error('Error parsing x-data expression:', code, e);
    return {};
  }
}

/**
 * Parses an x-for expression (e.g., "item in items")
 */
export function parseForExpression(expression: string): [string, string] {
  const match = expression.trim().match(/^(.*)\s+in\s+(.*)$/);
  if (match) {
    return [match[1].trim(), match[2].trim()];
  }
  console.warn('Could not parse x-for expression:', expression);
  return ['item', expression]; // Default fallback
}

// Types for directive handlers
type DirectiveHandler = (node: any, value: string, modifiers: string[]) => Partial<MitosisNode>;

// TODO: Implement directive handlers map
export const directiveHandlers: Record<string, DirectiveHandler> = {
  'x-data': (node, value) => {
    const state = parseStateObject(value);
    // Return state under meta.alpineState, not directly as node.state
    return {
      meta: {
        alpineState: Object.entries(state).reduce((acc, [key, stateValue]) => {
            // Represent the initial value as a string or JSON for simplicity
            const codeValue = typeof stateValue === 'string' ? `'${stateValue}'` : JSON.stringify(stateValue);
            acc[key] = {
              code: codeValue,
              type: 'property', // Or 'function' based on value type
            };
            return acc;
          }, {} as MitosisComponent['state'])
      }
    };
  },
  'x-text': (node, value) => ({
    bindings: {
      _text: createSingleBinding({
        code: transformAlpineExpression(value),
      }),
    },
  }),
  'x-bind': (node, value, modifiers) => {
    // Modifiers usually contain the attribute name
    const attributeName = modifiers[0] || 'value'; // Default? Needs check
    // Handle special cases like :class or :style
    if (attributeName === 'class') {
      // TODO: Advanced class binding logic
    }
    if (attributeName === 'style') {
      // TODO: Advanced style binding logic
    }

    return {
      bindings: {
        [attributeName]: createSingleBinding({
          code: transformAlpineExpression(value),
        }),
      }
    };
  },
  'x-on': (node, value, modifiers) => {
    // Modifiers usually contain the event name (e.g., click, keydown.enter)
    const eventName = modifiers[0] || 'click'; // Default? Needs check
    // TODO: Handle event modifiers like .prevent, .stop, .enter, etc.
    const handlerCode = transformAlpineExpression(value);
    return {
      bindings: {
        [`on${capitalize(eventName)}`]: createSingleBinding({
          code: handlerCode,
          // type: 'function' ?
        }),
      }
    };
  },
  // Add other handlers: x-if, x-for, x-model, x-show, x-html, etc.
  'x-if': (node, value) => {
    return {
        // Mitosis uses <Show> component for conditional rendering
        name: 'Show',
        bindings: {
          when: createSingleBinding({ code: transformAlpineExpression(value) })
        }
        // Children will be handled by the main transformNode logic
    };
  },
  'x-for': (node, value) => {
    const [itemName, iterableName] = parseForExpression(value);
    return {
        // Mitosis uses <For> component for loops
        name: 'For',
        bindings: {
          each: createSingleBinding({ code: transformAlpineExpression(iterableName) })
        },
        scope: {
          forName: itemName
        }
        // Children will be handled by the main transformNode logic
    };
  },
  'x-model': (node, value) => {
    // Basic model implementation assumes input element
    const propertyName = transformAlpineExpression(value);
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
  // Add other handlers as needed...
}; 