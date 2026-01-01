import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Selora OCR Service' });
});

// ============================================================
// OCR ENDPOINT - Base64 Image
// ============================================================
app.post('/api/ocr/extract', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    // Initialize Gemini model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a medical document OCR specialist. Extract all text from the provided medical document image.

Your response must be a valid JSON object with these fields:
- extractedText: The full text extracted from the document
- documentType: One of "lab_result", "prescription", "imaging_report", "discharge_summary", "medical_certificate", "other"
- confidence: A number 0-100 indicating extraction confidence
- keyFindings: Array of important medical findings/values detected
- patientInfo: Object with name, date, or any patient identifiers found (or null)
- suggestedTags: Array of relevant tags for categorization

Be thorough and accurate. If text is unclear, indicate [unclear] in that section.
Return ONLY the JSON object, no additional text.`;

    // Convert base64 to image part
    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType || 'image/jpeg',
      },
    };

    // Generate content
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    let parsedResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: treat as plain text extraction
        parsedResult = {
          extractedText: text,
          documentType: 'other',
          confidence: 70,
          keyFindings: [],
          patientInfo: null,
          suggestedTags: ['scanned-document'],
        };
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      parsedResult = {
        extractedText: text,
        documentType: 'other',
        confidence: 60,
        keyFindings: [],
        patientInfo: null,
        suggestedTags: ['scanned-document'],
      };
    }

    res.json(parsedResult);
  } catch (error) {
    console.error('OCR extraction error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Selora OCR Service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 OCR endpoint: http://localhost:${PORT}/api/ocr/extract`);
});