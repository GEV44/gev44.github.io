// Run: node tests/ask.test.js
const assert = require('assert');
const Ask = require('../assets/ask.js');
const sets = require('../assets/ask-docs.js');

const checks = {
  dental: [
    ['Can I cancel an appointment the day before without paying?', 'Cancelling or changing an appointment'],
    ['My tooth was knocked out, what do I do?', 'Dental emergencies'],
    ['Do you offer sedation for nervous patients?', 'Dental anxiety and sedation'],
    ['Can children come for a check-up?', 'Children and young patients'],
    ['Do you work with insurance companies?', 'Fees, payment and insurance']
  ],
  store: [
    ['How many days do refunds take to show up in my account?', 'Refunds and how long they take'],
    ['What does the warranty not cover?', 'Warranty cover'],
    ['Do I have to pay customs duties on international orders?', 'International shipping and customs'],
    ['Can I return an opened mattress?', 'Items that cannot be returned'],
    ['How do I make a warranty claim?', 'Making a warranty claim']
  ],
  handbook: [
    ['Where do I submit an expense claim and by when?', 'Expenses: how to submit a claim'],
    ['Can I work from another country?', 'Remote work and working from home'],
    ['How much paternity leave does a father get?', 'Parental leave'],
    ['How many days of annual leave do I get?', 'Annual leave'],
    ['What is the notice period if I resign?', 'Leaving the company']
  ]
};
const offTopic = ['What is the capital of France?', 'How do I train a neural network?'];

assert.strictEqual(Ask.stem('refund'), Ask.stem('refunds'));
assert.strictEqual(Ask.stem('cancelled'), Ask.stem('cancellation'));
assert.strictEqual(Ask.stem('reimbursed'), Ask.stem('refund'));

let pass = 0;
sets.forEach(function (s) {
  const chunks = Ask.chunkDocument(s.text, { docName: s.title });
  const idx = Ask.buildIndex(chunks);
  const words = s.text.split(/\s+/).length;
  assert(words >= 800 && words <= 1700, s.id + ' word count ' + words);
  assert(chunks.every(c => c.text.split(/\s+/).length <= 200), s.id + ' chunk too long');
  console.log(s.id, words + ' words', chunks.length + ' chunks');
  checks[s.id].forEach(function ([q, h]) {
    const r = Ask.answer(idx, q);
    const top = Ask.search(idx, q, 1)[0];
    assert.strictEqual(top.chunk.section, h, s.id + ': "' + q + '" -> ' + top.chunk.section);
    assert(r.confident, 'not confident: ' + q);
    assert(r.sentences.length >= 1 && r.sentences.length <= 3, 'sentence count');
    r.sentences.forEach(x => assert(s.text.replace(/\s+/g, ' ').includes(x.text), 'invented text: ' + x.text));
    assert(r.sources.length >= 1 && /<mark>/.test(r.sources[0].html), 'no highlight');
    pass++;
  });
  s.questions.forEach(function (q) {
    const r = Ask.answer(idx, q);
    assert(r.confident && r.sentences.length, 'chip not answered: ' + q);
  });
  offTopic.forEach(function (q) {
    assert(!Ask.answer(idx, q).confident, s.id + ' should be low confidence: ' + q);
  });
});
console.log('OK: ' + pass + ' retrieval checks, chips answered, off-topic flagged');
