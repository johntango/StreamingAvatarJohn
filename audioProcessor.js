class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sampleRate = 44100; // Typical sample rate; adjust as needed.
        this.chunkSize = this.sampleRate * 5; // 5 seconds of audio
        this.audioBuffer = [];
    }

    process(inputs) {
        const input = inputs[0];
        if (input.length > 0) {
            this.audioBuffer.push(...input[0]); // Accumulate samples

            if (this.audioBuffer.length >= this.chunkSize) {
                // Send the 10-second chunk to the main thread
                this.port.postMessage(this.audioBuffer.slice(0, this.chunkSize));
                // Remove the processed chunk
                this.audioBuffer = this.audioBuffer.slice(this.chunkSize);
            }
        }
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);