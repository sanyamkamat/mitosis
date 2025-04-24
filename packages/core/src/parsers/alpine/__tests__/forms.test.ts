import { alpineToMitosisComponent } from '../index';

describe('alpineToMitosisComponent: Forms', () => {
  it('should handle basic x-model on text input', () => {
    const template = `
      <div x-data="{ message: 'Hello' }">
        <input type="text" x-model="message">
        <span x-text="message"></span>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

  it('should handle x-model on textarea', () => {
    const template = `
      <div x-data="{ text: 'Long text' }">
        <textarea x-model="text"></textarea>
        <pre x-text="text"></pre>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

  // TODO: Add tests for x-model on checkboxes, radios, selects

}); 