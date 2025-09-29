const mongoose = require('mongoose');
const Category = require('../models/Category');
require('dotenv').config();

// Categories based on the frontend dropdown in publish-event.html
const categories = [
  { name: 'Music', value: 'music', description: 'Music events, concerts, and performances', sortOrder: 1 },
  { name: 'Business & Professional', value: 'business', description: 'Professional networking and business events', sortOrder: 2 },
  { name: 'Food & Drink', value: 'food', description: 'Food festivals, wine tastings, and culinary events', sortOrder: 3 },
  { name: 'Community & Culture', value: 'community', description: 'Community gatherings and cultural events', sortOrder: 4 },
  { name: 'Performing & Visual Arts', value: 'performing-arts', description: 'Theater, dance, art exhibitions, and visual arts events', sortOrder: 5 },
  { name: 'Film, Media & Entertainment', value: 'film-media', description: 'Movie screenings, media events, and entertainment', sortOrder: 6 },
  { name: 'Sports & Fitness', value: 'sports', description: 'Sporting events, fitness classes, and recreational activities', sortOrder: 7 },
  { name: 'Health & Wellness', value: 'health', description: 'Health seminars, wellness workshops, and medical events', sortOrder: 8 },
  { name: 'Science & Technology', value: 'science-tech', description: 'Tech conferences, science exhibitions, and educational events', sortOrder: 9 },
  { name: 'Travel & Outdoor', value: 'travel-outdoor', description: 'Travel experiences, outdoor adventures, and nature events', sortOrder: 10 },
  { name: 'Charity & Causes', value: 'charity', description: 'Fundraising events, charity drives, and social causes', sortOrder: 11 },
  { name: 'Religion & Spirituality', value: 'religion', description: 'Religious gatherings, spiritual events, and faith-based activities', sortOrder: 12 },
  { name: 'Family & Education', value: 'family-education', description: 'Family-friendly events, educational workshops, and learning activities', sortOrder: 13 },
  { name: 'Seasonal & Holiday', value: 'seasonal', description: 'Holiday celebrations, seasonal festivals, and themed events', sortOrder: 14 },
  { name: 'Government & Politics', value: 'government', description: 'Political events, government meetings, and civic activities', sortOrder: 15 },
  { name: 'Fashion & Beauty', value: 'fashion', description: 'Fashion shows, beauty events, and style workshops', sortOrder: 16 },
  { name: 'Home & Lifestyle', value: 'home-lifestyle', description: 'Home improvement, lifestyle events, and domestic activities', sortOrder: 17 },
  { name: 'Auto, Boat & Air', value: 'auto-boat-air', description: 'Vehicle shows, transportation events, and automotive activities', sortOrder: 18 },
  { name: 'Hobbies & Special Interest', value: 'hobbies', description: 'Hobby groups, special interests, and niche activities', sortOrder: 19 },
  { name: 'School Activities', value: 'school', description: 'School events, educational activities, and student gatherings', sortOrder: 20 },
  { name: 'Other', value: 'other', description: 'Events that don\'t fit into other categories', sortOrder: 21 }
];

// Event types based on the frontend dropdown
const eventTypes = [
  { name: 'Conference', value: 'conference', description: 'Large gatherings for professional or academic purposes', sortOrder: 1 },
  { name: 'Seminar or Talk', value: 'seminar', description: 'Educational presentations and discussions', sortOrder: 2 },
  { name: 'Tradeshow, Consumer Show, or Expo', value: 'tradeshow', description: 'Industry exhibitions and consumer shows', sortOrder: 3 },
  { name: 'Convention', value: 'convention', description: 'Large gatherings of people with shared interests', sortOrder: 4 },
  { name: 'Festival or Fair', value: 'festival', description: 'Cultural celebrations and community fairs', sortOrder: 5 },
  { name: 'Concert or Performance', value: 'concert', description: 'Musical performances and live entertainment', sortOrder: 6 },
  { name: 'Screening', value: 'screening', description: 'Movie screenings and film showings', sortOrder: 7 },
  { name: 'Dinner or Gala', value: 'dinner', description: 'Formal dining events and fundraising galas', sortOrder: 8 },
  { name: 'Class, Training, or Workshop', value: 'class', description: 'Educational sessions and skill-building workshops', sortOrder: 9 },
  { name: 'Meeting or Networking Event', value: 'meeting', description: 'Business meetings and professional networking', sortOrder: 10 },
  { name: 'Party or Social Gathering', value: 'party', description: 'Social events and casual gatherings', sortOrder: 11 },
  { name: 'Rally', value: 'rally', description: 'Political rallies and advocacy events', sortOrder: 12 },
  { name: 'Tournament', value: 'tournament', description: 'Competitive sports and gaming tournaments', sortOrder: 13 },
  { name: 'Game or Competition', value: 'game', description: 'Competitive events and contests', sortOrder: 14 },
  { name: 'Race or Endurance Event', value: 'race', description: 'Running races, marathons, and endurance challenges', sortOrder: 15 },
  { name: 'Tour', value: 'tour', description: 'Guided tours and travel experiences', sortOrder: 16 },
  { name: 'Attraction', value: 'attraction', description: 'Tourist attractions and entertainment venues', sortOrder: 17 },
  { name: 'Camp, Trip, or Retreat', value: 'camp', description: 'Outdoor camps, trips, and spiritual retreats', sortOrder: 18 },
  { name: 'Appearance or Signing', value: 'appearance', description: 'Celebrity appearances and book signings', sortOrder: 19 },
  { name: 'Other', value: 'other', description: 'Events that don\'t fit into other types', sortOrder: 20 }
];

async function seedCategories() {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.NODE_ENV === 'production'
      ? process.env.MONGODB_URI_PRODUCTION
      : process.env.MONGODB_URI || 'mongodb://localhost:27017/crowd_events';

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: 'crowd_events'
    });

    console.log('Connected to MongoDB for seeding...');

    // Clear existing categories
    await Category.deleteMany({});
    console.log('Cleared existing categories');

    // Insert main categories
    const insertedCategories = await Category.insertMany(categories);
    console.log(`Inserted ${insertedCategories.length} main categories`);

    // Create event types as a parent category with subcategories
    const eventTypesParent = new Category({
      name: 'Event Types',
      value: 'event-types',
      description: 'Different types and formats of events',
      sortOrder: 0
    });
    await eventTypesParent.save();

    // Insert event types as subcategories
    const eventTypePromises = eventTypes.map(async (type) => {
      const eventType = new Category({
        ...type,
        parentCategory: eventTypesParent._id
      });
      await eventType.save();

      // Add to parent's subcategories array
      eventTypesParent.subcategories.push(eventType._id);

      return eventType;
    });

    const insertedEventTypes = await Promise.all(eventTypePromises);
    await eventTypesParent.save();

    console.log(`Inserted ${insertedEventTypes.length} event types as subcategories`);
    console.log('Categories seeded successfully!');

    // Display summary
    console.log('\n=== SEEDING SUMMARY ===');
    console.log(`Main Categories: ${insertedCategories.length}`);
    console.log(`Event Types: ${insertedEventTypes.length}`);
    console.log(`Total Categories: ${insertedCategories.length + insertedEventTypes.length + 1}`);

    process.exit(0);

  } catch (error) {
    console.error('Error seeding categories:', error);
    process.exit(1);
  }
}

// Run the seeding function
if (require.main === module) {
  seedCategories();
}

module.exports = { seedCategories, categories, eventTypes };