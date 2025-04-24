import * as parse5 from 'parse5';
import { CommentNode, DocumentFragment, Element, Node, TextNode } from 'parse5/dist/tree-adapters/default';
import { createMitosisComponent } from '../../helpers/create-mitosis-component';
import { createMitosisNode } from '../../helpers/create-mitosis-node';
import { MitosisComponent } from '../../types/mitosis-component';
import { MitosisNode } from '../../types/mitosis-node';
import { directiveHandlers } from './helpers';

interface AlpineToMitosisOptions {
  preserveComments?: boolean;
}

function isElement(node: Node): node is Element {
  return node.nodeName !== '#text' && node.nodeName !== '#comment';
}

function isTextNode(node: Node): node is TextNode {
  return node.nodeName === '#text';
}

function isCommentNode(node: Node): node is CommentNode {
  return node.nodeName === '#comment';
}

function transformNode(
  node: Node,
  options: AlpineToMitosisOptions,
): MitosisNode | null {
  if (isTextNode(node)) {
    // Ignore whitespace-only text nodes
    if (node.value.trim().length === 0) {
      return null;
    }
    return createMitosisNode({
      name: '#text',
      properties: {
        _text: node.value,
      },
    });
  }

  if (isCommentNode(node)) {
    if (options.preserveComments) {
      return createMitosisNode({
        name: '#comment',
        properties: {
          _text: node.data,
        },
      });
    }
    return null;
  }

  if (isElement(node)) {
    let mitosisNode = createMitosisNode({
      name: node.tagName,
      properties: {},
      bindings: {},
      children: [],
      meta: {},
    });

    let xDataState = {};

    // Separate attributes into directives and regular properties
    const alpineDirectives: Array<[string, string, string[]]> = [];
    for (const attr of node.attrs) {
      if (attr.name.startsWith('x-') || attr.name.startsWith('@') || attr.name.startsWith(':')) {
        let directiveName = attr.name;
        let eventName = '';
        let modifiers: string[] = [];

        if (attr.name.startsWith('@')) {
          directiveName = 'x-on';
          const parts = attr.name.substring(1).split('.');
          eventName = parts[0];
          modifiers = [eventName, ...parts.slice(1)];
        } else if (attr.name.startsWith(':')) {
          directiveName = 'x-bind';
          const parts = attr.name.substring(1).split('.');
          const attributeName = parts[0];
          modifiers = [attributeName, ...parts.slice(1)];
        } else {
           const parts = attr.name.split('.');
           directiveName = parts[0];
           modifiers = parts.slice(1);
        }
        
        alpineDirectives.push([directiveName, attr.value, modifiers]);

      } else {
        mitosisNode.properties[attr.name] = attr.value;
      }
    }

    // Process directives - order might matter (e.g., x-data first)
    // This basic loop doesn't enforce order, might need refinement
    for (const [directiveName, value, modifiers] of alpineDirectives) {
      const handler = directiveHandlers[directiveName];
      if (handler) {
        const partialNode = handler(node, value, modifiers);
        
        // Special handling for state merging from x-data (expecting it in meta)
        if (directiveName === 'x-data' && partialNode.meta?.alpineState) {
            xDataState = partialNode.meta.alpineState;
        }

        // Merge properties 
        if (partialNode.properties) {
            mitosisNode.properties = { ...mitosisNode.properties, ...partialNode.properties };
        }
        // Merge bindings
        if (partialNode.bindings) {
            mitosisNode.bindings = { ...mitosisNode.bindings, ...partialNode.bindings };
        }
        // Handle special cases like x-if/x-for renaming the node
        if (partialNode.name && (partialNode.name === 'Show' || partialNode.name === 'For')) {
           mitosisNode.name = partialNode.name;
           mitosisNode.scope = { ...mitosisNode.scope, ...partialNode.scope };
        }
        // Meta properties if needed
         if (partialNode.meta) {
           // Merge meta, excluding alpineState which is handled above
           const { alpineState, ...otherMeta } = partialNode.meta;
           mitosisNode.meta = { ...mitosisNode.meta, ...otherMeta };
        }
      } else {
        console.warn(`Unhandled Alpine directive: ${directiveName}`);
      }
    }
    
    // Recursively transform children, but skip children if x-if/x-for was processed
    if (mitosisNode.name !== 'Show' && mitosisNode.name !== 'For') {
        mitosisNode.children = node.childNodes
          .map((child: Node) => transformNode(child, options))
          .filter((child: MitosisNode | null): child is MitosisNode => child !== null);
    } else {
        // For Show/For, the original element becomes the single child
        const originalElementNode = createMitosisNode({
            name: node.tagName,
            properties: { ...mitosisNode.properties },
            bindings: { ...mitosisNode.bindings },
            children: node.childNodes
                      .map((child: Node) => transformNode(child, options))
                      .filter((child: MitosisNode | null): child is MitosisNode => child !== null),
        });
        // Clear bindings/properties on the Show/For node itself as they are now on the child
        const structuralBindings: Record<string, any> = {};
        if(mitosisNode.name === 'Show') {
            const xIfDirective = alpineDirectives.find(d => d[0] === 'x-if');
            if (xIfDirective) {
                structuralBindings.when = directiveHandlers['x-if'](node, xIfDirective[1], []).bindings?.when;
            }
        }
        if(mitosisNode.name === 'For') {
            const xForDirective = alpineDirectives.find(d => d[0] === 'x-for');
            if (xForDirective) {
               structuralBindings.each = directiveHandlers['x-for'](node, xForDirective[1], []).bindings?.each;
            }
        }
        mitosisNode.bindings = structuralBindings;
        mitosisNode.properties = {};
        
        mitosisNode.children = [originalElementNode];
    }

    // Store state temporarily in meta property
    if (Object.keys(xDataState).length > 0) {
        mitosisNode.meta.alpineState = xDataState;
    }

    return mitosisNode;
  }

  // Should not happen for valid HTML
  console.warn('Unhandled node type:', node.nodeName);
  return null;
}

export function alpineToMitosisComponent(
  template: string,
  options: AlpineToMitosisOptions = {},
): MitosisComponent {
  const component = createMitosisComponent();

  try {
    // Use parseFragment, returns DocumentFragment by default
    const ast = parse5.parseFragment(template, {
      sourceCodeLocationInfo: true,
    }) as DocumentFragment;

    component.children = ast.childNodes
      .map((node: Node) => transformNode(node, options))
      .filter((node: MitosisNode | null): node is MitosisNode => node !== null);

    // Hoist state from meta property
    if (component.children.length === 1 && component.children[0].meta.alpineState) {
        component.state = component.children[0].meta.alpineState as MitosisComponent['state'];
        delete component.children[0].meta.alpineState; // Remove from node after hoisting
    }

  } catch (error) {
    console.error('Error parsing Alpine.js template:', error);
    // Return empty component on error
  }

  return component;
} 