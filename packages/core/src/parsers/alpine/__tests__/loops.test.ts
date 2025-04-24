import { alpineToMitosisComponent } from '../index';

describe('alpineToMitosisComponent: Loops', () => {
  it('should handle basic x-for', () => {
    const template = `
      <div x-data="{ items: ['foo', 'bar'] }">
        <ul>
          <template x-for="item in items">
            <li x-text="item"></li>
          </template>
        </ul>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

  it('should handle x-for with index', () => {
    const template = `
      <div x-data="{ items: ['A', 'B', 'C'] }">
        <dl>
          <template x-for="(item, index) in items">
            <fragment>
              <dt x-text="index"></dt>
              <dd x-text="item"></dd>
            </fragment>
          </template>
        </dl>
      </div>
    `;
    // Note: Using <fragment> inside template as Alpine doesn't require a single root
    // The parser logic might need adjustment to handle this correctly for Mitosis.
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

  it('should handle nested x-for', () => {
    const template = `
      <div x-data="{ groups: [ { name: 'G1', items: ['A','B'] }, { name: 'G2', items: ['C','D'] } ] }">
        <template x-for="group in groups">
          <div>
            <h3 x-text="group.name"></h3>
            <ul>
              <template x-for="item in group.items">
                 <li x-text="item"></li>
              </template>
            </ul>
          </div>
        </template>
      </div>
    `;
    const component = alpineToMitosisComponent(template);
    expect(component).toMatchSnapshot();
  });

}); 