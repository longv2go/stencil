import { Component, h, Listen } from '../index';
import { VNodeData } from '../../util/interfaces';

@Component({
  tag: 'ion-nav'
})
export class Nav {
  @State() childStack: [any] = [];
  @State() stack: [string] = [];

  @Prop() root: string;

  componentDidLoad() {
    this.stack = [ ...this.stack, this.root ];
  }

  @Listen('ionNavChildDidLoad')
  navChildDidLoad(ev) {
    const child = ev.detail.child;

    this.childStack = [ ...this.childStack, child ];
  }

  @Listen('ionNavChildDidUnload')
  navChildDidUnload(ev) {
    this.childStack = this.childStack.filter(t => t !== ev.detail.child)
  }

  push(component) {
    console.log('Pushing', component);
    this.stack = [ ...this.stack, component ];
  }

  pop() {
    console.log('Popping');
    this.stack = this.stack.slice(0, -1)
  }

  render() {
    const stack = [];
    this.stack.map((c, i) => {
      const ChildComponent = c;
      const childStyle = {
        display: i == (this.stack.length - 1) ? 'block' : 'none'
      };
      stack.push(<ChildComponent navigator={this} style={childStyle}/>);
    })

    console.log('Rendering nav stack', stack);

    return [
      stack,
      <div class="nav-decor"></div>
    ]
  }
}
