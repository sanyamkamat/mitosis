import { alpineToMitosisComponent } from '../index';

describe('alpineToMitosisComponent: Simple Cases', () => {
  it('should parse a simple counter component', () => {
    const template = `
      <div x-data="{ count: 0 }">
        <button @click="count++">Increment</button>
        <span x-text="count">0</span>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    // Uncomment snapshot test
    expect(component).toMatchSnapshot();
  });

  it('should handle basic text', () => {
     const template = `<div>Hello World</div>`;
     const component = alpineToMitosisComponent(template);
     expect(component).toMatchSnapshot();
    // Keep specific checks for clarity if needed
    // expect(component.children[0].name).toBe('div');
    // expect(component.children[0].children[0].properties?._text).toBe('Hello World');
  });

  it('should handle x-show', () => {
    const template = `
      <div x-data="{ open: true }">
        <span x-show="open">Visible</span>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

  it('should handle x-html', () => {
    const template = `
      <div x-data="{ content: '<b>Bold</b>' }">
        <span x-html="content"></span>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

  it('should handle x-ref and x-init', () => {
    const template = `
      <div x-data="{ text: '' }" x-init="text = $refs.myInput.value">
        <input x-ref="myInput" value="Initial Value">
        <span x-text="text"></span>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

});

// TODO: Add more tests for bindings, directives, etc. 