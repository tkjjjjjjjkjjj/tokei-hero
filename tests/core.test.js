const test = require('node:test');
const assert = require('node:assert/strict');
const { core } = require('../app.js');

test('hands point correctly at 3:00', () => {
  assert.deepEqual(core.handAngles(3, 0), { hour: 90, minute: 0 });
});

test('hour hand moves halfway between numbers at 3:30', () => {
  assert.deepEqual(core.handAngles(3, 30), { hour: 105, minute: 180 });
});

test('time labels are child-friendly', () => {
  assert.equal(core.formatTime(7, 0), '7じ');
  assert.equal(core.formatTime(7, 5), '7じ 5ふん');
  assert.equal(core.digitalTime(7, 5), '7:05');
});

test('all generated choices are distinct and include the answer', () => {
  for (const level of ['easy', 'medium', 'challenge']) {
    for (const question of [{ hour: 12, minute: 0 }, { hour: 3, minute: 30 }, { hour: 7, minute: 55 }]) {
      const choices = core.makeChoices(question, level);
      assert.equal(choices.length, 3);
      assert.equal(new Set(choices).size, 3);
      assert.ok(choices.includes(core.formatTime(question.hour, question.minute)));
    }
  }
});

test('medium and challenge choices test the minute hand too', () => {
  const q = { hour: 3, minute: 30 };
  assert.ok(core.makeChoices(q, 'medium').includes('3じ'));
  assert.ok(core.makeChoices(q, 'challenge').some((choice) => choice.startsWith('3じ ') && choice !== '3じ 30ふん'));
});

test('random question stays within the selected level minute set', () => {
  const qEasy = core.generateQuestion('easy', '', () => 0.42);
  assert.equal(qEasy.minute, 0);
  const qMedium = core.generateQuestion('medium', '', () => 0.99);
  assert.ok([0, 30].includes(qMedium.minute));
  const qChallenge = core.generateQuestion('challenge', '', () => 0.99);
  assert.equal(qChallenge.minute, 55);
  assert.ok(qChallenge.hour >= 1 && qChallenge.hour <= 12);
});

test('star thresholds match a six-question round', () => {
  assert.equal(core.starCount(6), 3);
  assert.equal(core.starCount(4), 2);
  assert.equal(core.starCount(0), 1);
});
