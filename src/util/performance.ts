const perf = typeof performance !== 'undefined' && performance;

function throwIfEmpty (name: any) {
  if (!name) {
    throw new Error('name must be non-empty');
  }
}

let itemMap = new WeakMap();
let counter = 1;

/**
 * This function will create a performance mark
 * @param item
 * @param eventName
 */
export function mark(item: Object | string, eventName: string) {
  throwIfEmpty(item);
  let guid: number | string;

  if (typeof item === 'object') {
    guid = counter += 1;
    itemMap.set(item, guid);
  } else {
    guid = item;
  }

  perf.mark(`start ${guid} ${eventName}`);
}

/**
 * Stop and create a performance measurement
 * @param item
 * @param eventName
 * @param measurementName
 */
export function stop(item: Object | string, eventName: string, measurementName?: string) {
  throwIfEmpty(item);

  let guid = (typeof item === 'object') ?
    itemMap.get(item) :
    item;

  perf.measure(measurementName || `${guid} - ${eventName}`, `start ${guid} ${eventName}`);
}
