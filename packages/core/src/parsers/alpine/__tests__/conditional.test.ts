import { alpineToMitosisComponent } from '../index';

describe('alpineToMitosisComponent: Conditionals', () => {
  it('should handle basic x-if', () => {
    const template = `
      <div x-data="{ show: true }">
        <template x-if="show">
          <span>Shown</span>
        </template>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

  it('should handle x-if with else (via adjacent templates)', () => {
    const template = `
      <div x-data="{ show: false }">
        <template x-if="show">
          <span>Shown</span>
        </template>
        <template x-if="!show">
          <span>Not Shown</span>
        </template>
      </div>
    `;
    // Note: Mitosis doesn't have a direct else. This pattern relies on mutually exclusive conditions.
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

  it('should handle nested x-if', () => {
    const template = `
       <div x-data="{ showOuter: true, showInner: false }">
        <template x-if="showOuter">
          <div>
            Outer is visible.
            <template x-if="showInner">
              <span>Inner is visible.</span>
            </template>
             <template x-if="!showInner">
              <span>Inner is hidden.</span>
            </template>
          </div>
        </template>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

}); 