<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://dev.iliadmediagroup.com/images/sagexml/sagexml.jpeg" />
</div>

# Run and Deploy Sage XML Reporter:

This contains everything you need to run your app locally.

Download the Zip and extract...

## Run Locally via CLI or in a code editor/debugger like VSC

**Prerequisites:**  
Node.js
A Gemini API Key (easily obtained from most Google accounts by visiting: https://aistudio.google.com/apps
Sage Endec with Firmware that outputs XML reports

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key

   Create .env.local if it doesn't exist and create this entry:
  
   GEMINI_API_KEY="YourApiKeyBetweenQuotes"
   
5. Run the app:
   `npm run dev`
