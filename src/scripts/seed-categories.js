const mongoose = require("mongoose");
const Category = require("../models/Category");
require("dotenv").config(); // Load environment variables

const seedCategories = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log("Connected to MongoDB");

        const categories = [
            { name: "In-Ear", isListed: true },
            { name: "On-Ear", isListed: true },
            { name: "Over-Ear", isListed: true },
        ];

        for (const cat of categories) {
            const existing = await Category.findOne({ name: cat.name });
            if (!existing) {
                await Category.create(cat);
                console.log(`Created category: ${cat.name}`);
            } else {
                console.log(`Category already exists: ${cat.name}`);
            }
        }

        console.log("Categories seeded successfully");
        process.exit();
    } catch (error) {
        console.error("Error seeding categories:", error);
        process.exit(1);
    }
};

seedCategories();
