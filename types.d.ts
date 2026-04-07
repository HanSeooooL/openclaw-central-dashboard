// CSS 모듈 타입 선언
declare module "*.css" {
  const styles: { [className: string]: string };
  export default styles;
}
