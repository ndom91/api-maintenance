const express = require('express');

const app = express();

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.get('/', (req, res) => {
    res.json({"message": "Newtelco Maintenance API"});
});

app.get('/mail', (req, res) => {
  return res.send('GET HTTP method on mail resource');
});

app.get('/mail/:mailId', (req, res) => {
  return res.send(`GET HTTP method on mail resource with id ${req.params.mailId}`);
});

app.listen(4100, () => {
    console.log("Server is listening on port 4100");
});