// Test fixture: Database query duplicates

// Duplicate Group 11: Prisma findMany patterns
// Expected: 3 structural duplicates

async function getActiveUsers(prisma) {
  return await prisma.user.findMany({
    where: { active: true }
  });
}

async function fetchActiveUsers(prisma) {
  return await prisma.user.findMany({
    where: { active: true }
  });
}

async function listActiveUsers(prisma) {
  return await prisma.user.findMany({
    where: { active: true }
  });
}

// Duplicate Group 12: Count queries
// Expected: 2 exact duplicates

async function countUsers(prisma) {
  return await prisma.user.count();
}

async function getUserCount(prisma) {
  return await prisma.user.count();
}

// NOT a duplicate - has where clause
async function countActiveUsers(prisma) {
  return await prisma.user.count({
    where: { active: true }
  });
}

// Duplicate Group 13: Error handling pattern
// Expected: 2 exact duplicates

async function safeQuery(queryFn) {
  try {
    return await queryFn();
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
}

async function executeQuery(queryFn) {
  try {
    return await queryFn();
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
}
