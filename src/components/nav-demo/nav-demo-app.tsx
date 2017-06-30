import { Component, h, Prop } from '@stencil/core';

@Component({
  tag: 'nav-demo-app'
})
export class NavDemoApp {
  render() {
    return (
      <ion-page>
        <ion-nav root="nav-demo-page" />
      </ion-page>
    );
  }
}
