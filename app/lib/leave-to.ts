// 整页离开本应用，去另一个地址（例如身份提供方的退出页）。单独成一个函数，测试里好替换。
export function leaveTo(url: string): void {
  window.location.assign(url)
}
