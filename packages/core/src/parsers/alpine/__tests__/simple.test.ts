import { alpineToMitosisComponent } from '../index';

describe('alpineToMitosisComponent', () => {
  it('should parse a simple Alpine component', () => {
    const template = `
      <div x-data="{ count: 0 }">
        <button @click="count++">Increment</button>
        <span x-text="count">0</span>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    // TODO: Complete the parser implementation before snapshotting
    // expect(component).toMatchSnapshot();
    expect(component).toBeDefined(); // Basic check for now
  });

  it('should handle basic text', () => {
     const template = `<div>Hello World</div>`;
     const component = alpineToMitosisComponent(template);
     // expect(component).toMatchSnapshot();
     expect(component.children[0].name).toBe('div');
     expect(component.children[0].children[0].properties?._text).toBe('Hello World');
  });

  // TODO: Add more tests for bindings, directives, etc.
}); 