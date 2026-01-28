#!/usr/bin/env npx ts-node
/**
 * List available OpenAI models to find the correct one
 */

import OpenAI from 'openai';

async function listModels() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  console.log('📋 Fetching available OpenAI models...\n');

  try {
    const models = await openai.models.list();

    // Filter for GPT models and sort by ID
    const gptModels = models.data
      .filter(m => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3'))
      .sort((a, b) => a.id.localeCompare(b.id));

    console.log('Available GPT/O-series models:');
    console.log('━'.repeat(60));

    for (const model of gptModels) {
      console.log('  ' + model.id);
    }

    console.log('\n━'.repeat(60));
    console.log(`Total: ${gptModels.length} models`);

  } catch (error: any) {
    console.error('Error fetching models:', error.message || error);
    process.exit(1);
  }
}

listModels();
