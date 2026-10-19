// Internal JS target support. Match the managed runtime's exact radix
// intervals instead of depending on an engine's nondecimal Number spelling.
const apply = Reflect.apply;
const valueOf = Number.prototype.valueOf;
const intrinsicString = Number.prototype.toString;
const NumberClass = Number;
const create = Object.create;
const integer = BigInt;
const View = DataView, Storage = ArrayBuffer;
const setFloat = DataView.prototype.setFloat64, getWord = DataView.prototype.getUint32;
const RangeErrorClass = RangeError;
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';

function integerText(value, radix) {
  const base = integer(radix);let number = integer(value), text = '';
  if (number < 0n) number = -number;
  do {
    const digit = number % base;
    text = alphabet[NumberClass(digit)] + text;number /= base;
  } while (number !== 0n);
  return value < 0 ? '-' + text : text;
}

function positionalText(value, radix) {
  const view = new View(new Storage(8));
  apply(setFloat, view, [0, value, false]);
  const high = apply(getWord, view, [0, false]), low = apply(getWord, view, [4, false]);
  const exponent = (high >>> 20) & 2047, fraction = high & 1048575;
  const negative = high >>> 31;
  let a = (integer(fraction) << 32n) | integer(low);
  if (exponent !== 0) a += 1n << 52n;
  a <<= 2n;
  let b = 4n, below = exponent > 1 && fraction === 0 && low === 0 ? 1n : 2n, above = 2n;
  if (exponent >= 1075) {
    const shift = integer(exponent - 1075);a <<= shift;below <<= shift;above <<= shift;
  } else b <<= integer(exponent === 0 ? 1074 : 1075 - exponent);
  const base = integer(radix), digits = create(null);let length = 0, decimal = 0, parity = 0;
  if (a < b) {
    while (a < b) {
      // The managed nondecimal path may stop normalization just below one
      // when the upper rounding interval already crosses that boundary.
      if (a * 2n > b && a + above > b) break;
      a *= base;below *= base;above *= base;decimal--;
    }
  } else {
    while (a >= b * base) {b *= base;decimal++;}
  }
  for (;;) {
    const digit = NumberClass(a / b);a %= b;
    const lower = a < below, upper = a + above > b;
    digits[length++] = digit;parity = (parity * (radix & 1) + digit) & 1;
    const twice = a * 2n, nearest = twice > b || (twice === b && parity === 1);
    if ((nearest && upper) || (!nearest && lower)) {
      if (nearest) {
        let index = length, carry = true;
        while (index > 0 && carry) {
          index--;const next = digits[index] + 1;
          if (next === radix) digits[index] = 0;
          else {digits[index] = next;carry = false;}
        }
        if (carry) {digits[0] = 1;decimal++;}
      }
      break;
    }
    // The same finite-digit bound is used by heap-number-positional-text.
    if (length >= 64) throw new RangeErrorClass('number radix formatting did not converge');
    a *= base;below *= base;above *= base;
  }
  while (length > 1 && digits[length - 1] === 0) length--;
  let text = '';
  if (decimal < 0) {
    text = '0.';
    for (let index = 0; index < -1 - decimal; index++) text += '0';
    for (let index = 0; index < length; index++) text += alphabet[digits[index]];
  } else {
    const places = decimal + 1, count = places > length ? places : length;
    for (let index = 0; index < count; index++) {
      if (index === places && places < length) text += '.';
      text += index < length ? alphabet[digits[index]] : '0';
    }
  }
  return negative ? '-' + text : text;
}

function numberRadixText(receiver, argument) {
  // Validate [[NumberData]] before radix coercion, exactly as the original
  // builtin; no user valueOf hook or proxy trap is used for this brand check.
  let value;
  try {value = apply(valueOf, receiver, []);}
  catch {return apply(intrinsicString, receiver, [argument]);}
  let radix = 10;
  if (argument !== void 0) {
    const converted = +argument;
    radix = converted !== converted ? 0 : converted - converted % 1;
    if (radix < 2 || radix > 36 || radix !== radix)
      return apply(intrinsicString, value, [radix]);
  }
  // Decimal spelling and exceptional values already have the specified
  // common representation. Radix validation still occurs before this branch.
  if (radix === 10 || value === 0 || value !== value || value === Infinity || value === -Infinity)
    return apply(intrinsicString, value, [10]);
  return value % 1 === 0 ? integerText(value, radix) : positionalText(value, radix);
}

export {intrinsicString as numberStringBuiltin, numberRadixText};
