const express = require('express');
const OpenAI = require('openai')
const path = require('path');
const app = express();
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const { Readable } = require('stream');
const { toFile } = require("openai/uploads");
const { on } = require('events');
const { Configuration, NewSessionData, StreamingAvatarApi } = require("@heygen/streaming-avatar");

app.use(express.json());

// added by John R Williams MIT to track complex agentic states
let focus = { assistant_id: "", assistant_name: "", file_id: "", thread_id: "", message: "", func_name: "", run_id: "", status: "", vector_store_id: "" };

let HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

let heygen_API = {
  apiKey: HEYGEN_API_KEY,
  serverUrl: 'https://api.heygen.com',
};
console.log(`HEYGEN_API_KEY  ${JSON.stringify(heygen_API)}`);
// Put your OpenAI API key here or set it as an environment variable in Codespaces (I work in Codespaces) 
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
console.log(`OPENAI_API_KEY  ${process.env.OPENAI_API_KEY} `);


// This is for the OpenAI chat endpoint. 
const systemSetup = "you are a demo streaming avatar from HeyGen, an industry-leading AI generation product that specialize in AI avatars and videos.\nYou are here to showcase how a HeyGen streaming avatar looks and talks.\nPlease note you are not equipped with any specific expertise or industry knowledge yet, which is to be provided when deployed to a real customer's use case.\nAudience will try to have a conversation with you, please try answer the questions or respond their comments naturally, and concisely. - please try your best to response with short answers, limit to one sentence per response, and only answer the last question."

app.use(express.static(path.join(__dirname, '.')));

// This will call OpenAI chat completion endpoint with the prompt provided in the request body
app.post('/openai/chat', async (req, res) => {
  try {
    const prompt = req.body.prompt;
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemSetup },
        { role: 'user', content: prompt }
      ],
      model: 'gpt-3.5-turbo',
    });
    let message = chatCompletion.choices[0].message.content;
    console.log(message)
    res.json({ text: message });
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    res.status(500).send('Error processing your request');
  }
});

app.get('/newChat', async (req, res) => {
  let response = await switchThread();
  focus.thread_id = response.text;
  console.log(`New Chat Thread ID: ${focus.thread_id}`);
  res.status(200).json(response);
});

app.get('/getKeys', async (req, res) => {
  // use API token to get one time streaming token - This is not yet working

  /*let onetimeToken = await getOnetimeToken(heygen_API.apiKey)
    let avatar  = new StreamingAvatarApi(
    new Configuration({ accessToken: onetimeToken })
  );
  heygen_API.apiKey = onetimeToken;
  */

  res.status(200).json(heygen_API)
})
app.get('/getKeys2', async (req, res) => {
  // use API token to get one time streaming token - This is not yet working

  let avatar = await getAvatar(heygen_API.apiKey)
  // uses onetime token to create a streaming Avatar
  console.log(`Returning an avatar: ${JSON.stringify(avatar)}`)
  res.status(200).json(avatar)
})
async function getAvatar(HEYGEN_API_KEY) {
  try {
    if (!HEYGEN_API_KEY) {
      throw new Error("API key is missing");
    }

    const res = await fetch(
      "https://api.heygen.com/v1/streaming.create_token",
      {
        method: "POST",
        headers: {
          "x-api-key": HEYGEN_API_KEY,
        },
      }
    );
    const data = await res.json();
    console.log(`OneTime Token: ${JSON.stringify(data)}`);
    let token = data.data.token;
    let streamingAvatar = new StreamingAvatarApi(
      new Configuration({ accessToken: token })
    )
    return streamingAvatar;

  } catch (error) {
    console.error("Error retrieving access token:", error);

    return new Response("Failed to retrieve access token", {
      status: 500,
    });
  }
}
app.post('/openai/agent', async (req, res) => {
  let prompt = req.body.prompt;
  let assistant_id = req.body.assistant_id
  if (focus.thread_id == "") {
    await switchThread();
  }
  //
  // PLACE YOUR OWN OPENAI ASSISTANT ID HERE 
  // Attach VectorDB to Assistant if you want to constrain the responses 
  // In the Assistant system prompt tell it to answer from the files uploaded (ie files chosen from VectorDB)
  // You can create and attach VectorDB in the OpenAI Playground (attached to the Assistant)
  // Up to 10,000 files and 100 GB total data. 
  //
  focus.assistant_id = assistant_id; // John's CrewAI Documents Test
  let message = await runAssistant(`${prompt}.  Reply in one sentence`);  // John's Assistant handling by hand 
  console.log(message);
  res.json({ text: message });
})

// this creates a new thread for the assistant to run in
async function switchThread() {
  // create a new thread
  let thread = await openai.beta.threads.create();
  focus.thread_id = thread.id;
  // You could add vector store to thread but it is not necessary
  // focus.vector_store_id = "vs_2IALcdUrUzzG8gMCXUdSHLqh";
  //await modify_thread_with_vector_store(focus.thread_id, focus.vector_store_id);

  return { text: focus.thread_id };
}

// this attaches a vector store to a thread and is not used here
async function modify_thread_with_vector_store(thread_id, vector_store_id) {
  //Update the thread with new metadata and vector store ID
  let response = await openai.beta.threads.update(
    thread_id,
    metadata = {
      "i_attached_a_vector_store": "true",
    },
    tool_resources = {
      "file_search": {
        "vector_store_ids": [vector_store_id]
      }
    }
  )
  return response;
}

// OPENAI ASSISTANT - puts prompt onto thread and runs it
// this puts a message onto a thread and then runs the assistant 
async function runAssistant(prompt) {
  try {
    let thread_id = focus.thread_id;
    await openai.beta.threads.messages.create(thread_id,
      {
        role: "user",
        content: prompt,
      })
    // run and poll thread V2 API feature
    let run = await openai.beta.threads.runs.createAndPoll(thread_id, {
      assistant_id: focus.assistant_id
    })
    let run_id = run.id;
    focus.run_id = run_id;

    // now retrieve the messages
    let messages = await openai.beta.threads.messages.list(thread_id);
    messages = messages.data;
    let message_content = messages[0].content[0].text.value
    return message_content;

  }
  catch (error) {
    console.log(error);
    return error;
  }
}
// write ./whisper post 
const upload = multer({ storage: multer.memoryStorage() });
// Whisper API endpoint to transcribe audio to text - uses OpenAI's Whisper model. 
app.post('/whisper', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  };
  try {
    const formData = new FormData();
    formData.append('file', req.file.buffer, req.file.originalname);
    //fs.writeFileSync('test.wav', req.file.buffer);

    const name = "test.wav";
    const convertedFile = await toFile(Readable.from(req.file.buffer), name);
    const transciption = await openai.audio.translations.create({
      //file: fs.createReadStream('test.wav'),
      file: convertedFile,
      model: 'whisper-1',
    });
    const data = transciption.text;
    console.log('Transcription:', data)
    res.status(200).send(data);

  } catch (error) {
    console.error('Failed to send audio to Whisper:', error);
    res.status(500).send('Failed to process audio');
  }
});


app.listen(3000, function () {
  console.log('App is listening on port 3000!');
});
