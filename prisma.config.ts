// Agent skill-sync settings. Prisma 5 uses schema.prisma for ORM configuration
// and does not expose the newer prisma/config module.
const config = {
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
};

export default config;
