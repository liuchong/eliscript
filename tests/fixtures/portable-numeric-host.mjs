import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const numeric = await import(pathToFileURL(modulePath).href);

const {
  abs,
  checked_add: checkedAdd,
  checked_multiply: checkedMultiply,
  checked_subtract: checkedSubtract,
  clamp,
  compare_number: compareNumber,
  even_QMARK_: isEven,
  finite_QMARK_: isFiniteNumber,
  gcd,
  infinite_QMARK_: isInfinite,
  integer_QMARK_: isInteger,
  lcm,
  max_number: maxNumber,
  min_number: minNumber,
  modulo,
  nan_QMARK_: isNan,
  negative_QMARK_: isNegative,
  number_QMARK_: isNumber,
  odd_QMARK_: isOdd,
  positive_QMARK_: isPositive,
  quot,
  rem,
  safe_integer_QMARK_: isSafeInteger,
  sign,
  zero_QMARK_: isZero,
} = numeric;

const maxSafe = Number.MAX_SAFE_INTEGER;

const divisionCases = [
  [5, 3],
  [-5, 3],
  [5, -3],
  [-5, -3],
  [6, -3],
].map(([dividend, divisor]) => ({
  dividend,
  divisor,
  quot: quot(dividend, divisor),
  rem: rem(dividend, divisor),
  modulo: modulo(dividend, divisor),
}));

let generatedInvariant = true;
for (let index = 0; index < 50_000; index += 1) {
  const left = ((index * 104_729) % 2_000_003) - 1_000_001;
  let right = ((index * 130_363 + 17) % 1_999_999) - 999_999;
  if (right === 0) right = 1;

  const quotient = quot(left, right);
  const remainder = rem(left, right);
  const modulus = modulo(left, right);
  const divisor = gcd(left, right);
  const multiple = lcm(left, right);
  const expectedProduct = Math.abs(left * right);
  const modulusSign = modulus === 0 || Math.sign(modulus) === Math.sign(right);

  if (
    left !== quotient * right + remainder ||
    Math.abs(remainder) >= Math.abs(right) ||
    Math.abs(modulus) >= Math.abs(right) ||
    !modulusSign ||
    divisor !== gcd(right, left) ||
    rem(left, divisor) !== 0 ||
    rem(right, divisor) !== 0 ||
    multiple === null ||
    divisor * multiple !== expectedProduct ||
    checkedAdd(left, right) !== left + right ||
    checkedSubtract(left, right) !== left - right ||
    checkedMultiply(left, right) !== left * right
  ) {
    generatedInvariant = false;
    break;
  }
}

console.log(JSON.stringify({
  classification: {
    number: [isNumber(0), isNumber(NaN), isNumber(1n), isNumber("1")],
    finite: [
      isFiniteNumber(0),
      isFiniteNumber(maxSafe),
      isFiniteNumber(Infinity),
      isFiniteNumber(NaN),
    ],
    nan: [isNan(NaN), isNan(Infinity), isNan("NaN")],
    infinite: [isInfinite(Infinity), isInfinite(-Infinity), isInfinite(NaN)],
    integer: [isInteger(0), isInteger(-17), isInteger(1.5), isInteger(Infinity)],
    safeInteger: [
      isSafeInteger(maxSafe),
      isSafeInteger(-maxSafe),
      isSafeInteger(maxSafe + 1),
      isSafeInteger(1.5),
    ],
    zero: [isZero(0), isZero(-0), isZero(false)],
    positive: [isPositive(1), isPositive(Infinity), isPositive(0), isPositive(NaN)],
    negative: [isNegative(-1), isNegative(-Infinity), isNegative(-0), isNegative(NaN)],
    parity: [
      isEven(-4),
      isOdd(-3),
      isOdd(maxSafe),
      isEven(maxSafe - 1),
      isEven(maxSafe + 1),
      isOdd(1.5),
    ],
  },
  scalar: {
    abs: [abs(-9), abs(4), Object.is(abs(-0), 0), abs("9")],
    absNan: Number.isNaN(abs(NaN)),
    absInfinity: abs(-Infinity) === Infinity,
    sign: [sign(-Infinity), sign(-2), sign(-0), sign(2), sign(Infinity), sign("2")],
    signNan: Number.isNaN(sign(NaN)),
    compare: [
      compareNumber(-2, 1),
      compareNumber(1, 1),
      compareNumber(2, 1),
      compareNumber(NaN, 1),
      compareNumber(1, "1"),
    ],
    minimum: minNumber(7, -3, 12, 0),
    maximum: maxNumber(7, -3, 12, 0),
    minInfinity: minNumber(Infinity, 3, -Infinity) === -Infinity,
    maxInfinity: maxNumber(-Infinity, 3, Infinity) === Infinity,
    minNan: Number.isNaN(minNumber(3, NaN, 1)),
    maxNan: Number.isNaN(maxNumber(NaN, 3, 1)),
    minInvalid: minNumber(1, "0"),
    maxInvalid: maxNumber(1, null),
    clamp: [
      clamp(5, 0, 10),
      clamp(-1, 0, 10),
      clamp(11, 0, 10),
      clamp(5, 10, 0),
      clamp("5", 0, 10),
    ],
    clampNan: Number.isNaN(clamp(NaN, 0, 10)),
  },
  checked: {
    add: [checkedAdd(20, 22), checkedAdd(maxSafe, 0), checkedAdd(maxSafe, 1)],
    subtract: [
      checkedSubtract(20, 22),
      checkedSubtract(-maxSafe, 0),
      checkedSubtract(-maxSafe, 1),
    ],
    multiply: [
      checkedMultiply(6, 7),
      checkedMultiply(maxSafe, 0),
      checkedMultiply(maxSafe, 2),
    ],
    invalid: [
      checkedAdd(1.5, 2),
      checkedSubtract(1, Infinity),
      checkedMultiply(1n, 2),
    ],
    normalizedZeros: [
      Object.is(checkedAdd(-0, -0), 0),
      Object.is(checkedSubtract(-0, 0), 0),
      Object.is(checkedMultiply(-1, 0), 0),
    ],
  },
  division: {
    cases: divisionCases,
    invalid: [
      quot(1, 0),
      rem(1.5, 1),
      modulo(1, maxSafe + 1),
    ],
    normalizedZeros: [
      Object.is(quot(-1, 2), 0),
      Object.is(rem(-6, 3), 0),
      Object.is(modulo(-6, 3), 0),
    ],
  },
  integerAlgorithms: {
    gcd: [gcd(54, 24), gcd(-54, 24), gcd(0, 0), gcd(maxSafe, maxSafe)],
    lcm: [lcm(21, 6), lcm(-21, 6), lcm(0, maxSafe), lcm(maxSafe, maxSafe)],
    invalid: [gcd(1.5, 2), lcm(maxSafe, 2), lcm(Infinity, 1)],
    fibonacciGcd: gcd(7_540_113_804_746_346, 4_660_046_610_375_530),
  },
  properties: { generatedInvariant, cases: 50_000 },
}));
