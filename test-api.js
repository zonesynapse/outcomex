import http from 'http';

const data = JSON.stringify({
  syllabus: "test", 
  structure: [{"numQuestions": 1, "marksPerQuestion": 2, "isEitherOr": false}], 
  mappingContext: { "CO1": { "description": "Test CO", "pis": ["1.1"] } } 
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/generate-questions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
