const express = require('express');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');

dotenv.config();

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.STORAGEBUCKET_ID
});

const bucket = admin.storage().bucket();


const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function chat(message, prompt) {
  try {
    const fullMessage = `${prompt}\n${message}`;
    const result = await model.generateContent(fullMessage);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating response:', error);
    return 'An error occurred. Please try again later.';
  }
}

const upload = multer({ storage: multer.memoryStorage() });

const app = express();

app.use(bodyParser.json());
app.use(cors());

app.get('/', (req, res) => {
  res.send('Welcome to the ai-server! 🙏');
});

app.post('/chat', upload.single('file'), async (req, res) => {
  const prompt = 'You are an expert physician with over 1000 years of experience across all medical fields. I am uploading a medical report in PDF format. Please read and analyze it carefully. Identify and summarize all important points, providing a clear and accurate overview as if you are explaining to an adult person who has not graduated high school. Your analysis should include any potential issues, noting whether the findings are normal, concerning, or require further investigation. Ensure no critical details are missed, and deliver your response in a thorough, professional manner.';
  const { message } = req.body;
  const file = req.file;

  if (!message) {
    return res.status(400).send('Missing message in request body');
  }

  if (!file) {
    return res.status(400).send('No file uploaded');
  }

  const blob = bucket.file(`uploads/${file.originalname}`);
  const blobStream = blob.createWriteStream();

  blobStream.on('error', (error) => {
    console.error('Error uploading file:', error);
    return res.status(500).send('Error uploading file');
  });

  blobStream.on('finish', async () => {
    try {
      const [metadata] = await blob.getMetadata();
      const fileUrl = `https://storage.googleapis.com/${process.env.STORAGEBUCKET_ID}/uploads/${file.originalname}`;

      const pdfData = await pdfParse(file.buffer);
      const chatResponse = await chat(pdfData.text, prompt);

      res.json({
        fileUrl,
        message: chatResponse
      });
    } catch (error) {
      console.error('Error processing file:', error);
      res.status(500).send('Error processing file');
    }
  });

  blobStream.end(file.buffer);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
