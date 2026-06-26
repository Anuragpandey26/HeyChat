import prisma from '../src/core/database/prisma.singleton.js';
import bcrypt from 'bcrypt';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

// Helper functions matching frontend crypto logic
function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    privateKey: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

function deriveWrappingKey(username, password) {
  const normalizedUser = username.trim().toLowerCase();
  const seed = naclUtil.decodeUTF8(`heychat-wrap:${normalizedUser}:${password}`);
  const hash = nacl.hash(seed);
  return hash.slice(0, nacl.secretbox.keyLength);
}

function wrapPrivateKey(privateKeyB64, username, password) {
  const wrappingKey = deriveWrappingKey(username, password);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const privateKeyBytes = naclUtil.decodeBase64(privateKeyB64);
  const encrypted = nacl.secretbox(privateKeyBytes, nonce, wrappingKey);

  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);

  return naclUtil.encodeBase64(combined);
}

function deriveEscrowKey(securityAnswer) {
  const normalized = securityAnswer.trim().toLowerCase();
  const seed = naclUtil.decodeUTF8(`heychat-escrow:${normalized}`);
  const hash = nacl.hash(seed);
  return hash.slice(0, nacl.secretbox.keyLength);
}

function wrapPrivateKeyWithAnswer(privateKeyB64, securityAnswer) {
  const escrowKey = deriveEscrowKey(securityAnswer);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const privateKeyBytes = naclUtil.decodeBase64(privateKeyB64);
  const encrypted = nacl.secretbox(privateKeyBytes, nonce, escrowKey);

  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);

  return naclUtil.encodeBase64(combined);
}

const usersToSeed = [
  {
    email: 'anurag@gmail.com',
    password: 'Anurag@0326',
    username: 'anurag',
    fullName: 'Anurag',
  },
  {
    email: 'amit@gmail.com',
    password: 'Amit@0326',
    username: 'amit',
    fullName: 'Amit',
  },
  {
    email: 'aman@gmail.com',
    password: 'Aman@@0326',
    username: 'aman',
    fullName: 'Aman',
  },
  {
    email: 'rahul@gmail.com',
    password: 'Rahul@0326',
    username: 'rahul',
    fullName: 'Rahul',
  },
  {
    email: 'priya@gmail.com',
    password: 'Priya@0326',
    username: 'priya',
    fullName: 'Priya',
  },
  {
    email: 'sneha@gmail.com',
    password: 'Sneha@0326',
    username: 'sneha',
    fullName: 'Sneha',
  },
  {
    email: 'vikas@gmail.com',
    password: 'Vikas@0326',
    username: 'vikas',
    fullName: 'Vikas',
  },
];

async function main() {
  console.log('Starting database seeding...');
  const securityAnswer = 'recovery';

  for (const seedUser of usersToSeed) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: seedUser.email },
          { username: seedUser.username },
        ],
      },
    });

    if (existing) {
      console.log(`User ${seedUser.username} (${seedUser.email}) already exists. Skipping.`);
      continue;
    }

    console.log(`Seeding user: ${seedUser.username}...`);

    // 1. Hash password & security question answer
    const passwordHash = await bcrypt.hash(seedUser.password, 12);
    const securityQuestionHash = await bcrypt.hash(securityAnswer, 12);

    // 2. Generate E2EE keys
    const keyPair = generateKeyPair();
    const wrappedPrivateKey = wrapPrivateKey(keyPair.privateKey, seedUser.username, seedUser.password);
    const securityEscrowKey = wrapPrivateKeyWithAnswer(keyPair.privateKey, securityAnswer);

    // 3. Create user in the database
    await prisma.user.create({
      data: {
        fullName: seedUser.fullName,
        username: seedUser.username,
        email: seedUser.email,
        passwordHash,
        securityQuestionHash,
        publicKey: keyPair.publicKey,
        wrappedPrivateKey,
        securityEscrowKey,
        bio: 'Hello! I am using HeyChat.',
      },
    });

    console.log(`User ${seedUser.username} successfully seeded.`);
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
