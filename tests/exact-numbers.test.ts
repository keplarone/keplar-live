import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { exactCheck } from "@/lib/orchestration/exact";

const s = (q: string) => exactCheck(q)?.statement ?? null;

test("exact: plain-English number questions are computed by code, not left to the models", () => {
  assert.match(s("What is 100 divided by 7?")!, /= 14\.2857142857 /);
  assert.match(s("what's 12 times 4")!, /= 48 \(calculated exactly\)/);
  assert.match(s("10 minus -4")!, /= 14 /);
  assert.match(s("sqrt of 144")!, /= 12 \(calculated exactly\)/);
  assert.match(s("What is 12 squared?")!, /= 144 /);
  assert.match(s("5 cubed")!, /= 125 /);
  assert.match(s("factorial of 25")!, /25! = 15,511,210,043,330,985,984,000,000 /, "BigInt: exact past 2^53");
  assert.match(s("Is 97 prime?")!, /97 is a prime number/);
  assert.match(s("is 1,000,001 prime")!, /not a prime number: it is divisible by 101 \(101 × 9,901/);
  assert.match(s("Is 1 a prime number?")!, /not a prime number/);
  assert.match(s("Is 2 prime?")!, /2 is a prime number/);
  assert.match(s("What's 20% off $80?")!, /= \$64\.00 \(you save \$16\.00/);
  assert.match(s("convert 100 fahrenheit to celsius")!, /100°F = 37\.78°C/);
  assert.match(s("what is 37 C in F")!, /37°C = 98\.6°F/);
  assert.match(s("How many days are in 2024?")!, /366 days \(a leap year/);
  assert.match(s("how many days in 1900")!, /365 days \(not a leap year/, "century rule");
  assert.match(s("how many days in the year 2000?")!, /366 days/, "400-year rule");
});

test("exact: a rounded result says so instead of claiming exactness; float noise does not", () => {
  assert.match(s("What is the square root of 2?")!, /shown to 12 significant digits/);
  assert.match(s("What is 1/3?")!, /shown to 12 significant digits/);
  assert.match(s("what is 0.1+0.2")!, /= 0\.3 \(calculated exactly\)/);
  assert.match(s("10/4")!, /= 2\.5 \(calculated exactly\)/);
});

test("exact: anything that is not wholly one of these questions is left alone", () => {
  for (const q of [
    "What is the square root of a negative number?",
    "Is prime video worth it?",
    "how many times have you said that",
    "what is 5 times out of 10",
    "times square",
    "Is 97 prime and why do primes matter?",
    "convert 100 dollars to euros",
    "20% off everything at Target today?",
    "What is 1000! used for in physics",
    "Is 10000000000000000 prime?",
    "150% off $80",
  ]) assert.equal(exactCheck(q), null, q);
});
