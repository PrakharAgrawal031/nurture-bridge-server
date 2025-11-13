/**
 * Service for fetching and processing call summaries
 */

const VAPI_API_BASE = 'https://api.vapi.ai';
const NBT_BACKEND_API = 'https://nbt-backend.vercel.app/api/conversation';
const NBT_TEXT_API = 'https://nbt-backend.vercel.app/api/text';
const BEARER_TOKEN = '9929210d-c21b-4616-a816-e7c5caef6d5b';

/**
 * Sleep function for retry delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch call data from Vapi API with retry mechanism
 * @param {string} callId - The ID of the call to fetch
 * @param {number} maxRetries - Maximum number of retry attempts (default: 5)
 * @param {number} baseDelay - Base delay in milliseconds (default: 2000)
 * @returns {Promise<Object>} Call data from Vapi API
 */
export async function fetchCallData(callId, maxRetries = 5, baseDelay = 2000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetching call data for ${callId}, attempt ${attempt}/${maxRetries}`);
      
      const response = await fetch(`${VAPI_API_BASE}/call/${callId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch call data: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check if messages array exists and has content
      if (!data.messages || data.messages.length === 0) {
        throw new Error('No messages found in call data - call may still be processing');
      }
      
      console.log(`Successfully fetched call data with ${data.messages.length} messages`);
      return data;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      lastError = error;
      
      // If this is the last attempt, don't wait
      if (attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff: wait longer between retries
      const delay = baseDelay * Math.pow(1.5, attempt - 1);
      console.log(`Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }
  
  console.error('All retry attempts failed');
  throw lastError;
}

/**
 * Process conversation messages with NBT backend
 * @param {Array} messages - Array of messages from the call
 * @returns {Promise<Object>} Processed conversation data
 */
export async function processConversation(messages) {
  try {
    const response = await fetch(NBT_BACKEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      throw new Error(`Failed to process conversation: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error processing conversation:', error);
    throw error;
  }
}

/**
 * Process text with NBT backend text API
 * @param {string} text - The text to process
 * @returns {Promise<Object>} Processed text response
 */
export async function processText(text) {
  try {
    console.log('Processing text with NBT backend...');
    
    const response = await fetch(NBT_TEXT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Failed to process text: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Text processing completed successfully');
    return data;
  } catch (error) {
    console.error('Error processing text:', error);
    throw error;
  }
}

/**
 * Get complete call summary by fetching call data and processing it
 * @param {string} callId - The ID of the call to summarize
 * @returns {Promise<Object>} Complete summary with chat segregation and questions mapping
 */
export async function getCallSummary(callId) {
  try {
    console.log(`Starting call summary process for call ID: ${callId}`);
    
    // Step 1: Fetch call data from Vapi API with retry mechanism
    const callData = await fetchCallData(callId);
    
    // Step 2: Extract messages array (already validated in fetchCallData)
    const messages = callData.messages;
    console.log(`Processing ${messages.length} messages`);

    // Step 3: Process messages with NBT backend
    const processedData = await processConversation(messages);
    
    console.log('Call summary completed successfully');
    return {
      success: true,
      callData,
      summary: processedData,
    };
  } catch (error) {
    console.error('Error getting call summary:', error);
    return {
      success: false,
      error: error.message,
      callData: null,
      summary: null,
    };
  }
}





