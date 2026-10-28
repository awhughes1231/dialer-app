import { seedReferenceData } from "../src/lib/seed";

seedReferenceData()
  .then(() => {
    console.log("Seed complete");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
