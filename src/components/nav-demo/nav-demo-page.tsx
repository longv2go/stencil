import { Component, h, Prop } from '@stencil/core';



@Component({
  tag: 'nav-demo-page'
})
export class NavDemoPage {
  @Prop() navigator: Nav;

  @State() random: any;

  componentWillLoad() {
    this.random = 'Hello ' + (Math.random() % 1000);
  }

  handlePopClick() {
    console.log('Pop');
    this.navigator && this.navigator.pop();
  }

  handleNextClick() {
    console.log('Next');
    this.navigator && this.navigator.push('nav-demo-page');
  }

  render() {
    return (
      <ion-page>
        <h1>Page: {this.random}</h1>
        <ion-button onClick={this.handlePopClick.bind(this)}>Pop</ion-button>
        <ion-button onClick={this.handleNextClick.bind(this)}>Next</ion-button>
      </ion-page>
    );
  }
}
