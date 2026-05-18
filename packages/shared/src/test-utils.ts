export const testUtils = {
  // Test data generators
  generateTestMeeting: (overrides = {}) => ({
    id: 'test-meeting-1',
    title: 'Test Meeting',
    startTime: new Date().toISOString(),
    duration: 3600000, // 1 hour in ms
    participants: ['user1', 'user2'],
    ...overrides
  }),

  // Mock API response generators
  generateMockTranscription: () => ({
    id: 'test-transcript-1',
    meetingId: 'test-meeting-1',
    content: 'This is a test transcription content for meeting notes.',
    language: 'en',
    segments: [
      {
        id: 'segment-1',
        startTime: 0,
        endTime: 1000,
        text: 'Hello, this is a test segment.',
        speaker: 'Speaker 1'
      }
    ]
  }),

  // Assertion helpers
  expectToContain: (actual, expected) => {
    if (!actual.includes(expected)) {
      throw new Error(`Expected ${actual} to contain ${expected}`);
    }
  },

  expectToBeType: (value, expectedType) => {
    if (typeof value !== expectedType) {
      throw new Error(`Expected ${typeof value} to be ${expectedType}`);
    }
  }
};

export default testUtils;