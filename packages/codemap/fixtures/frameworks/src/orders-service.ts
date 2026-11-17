export function saveOrder(o: unknown) { return validate(o) }
function validate(o: unknown) { return o }
export class OrderRepository { insert(o: unknown) { return o } }
