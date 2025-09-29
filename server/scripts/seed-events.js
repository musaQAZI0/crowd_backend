const mongoose = require('mongoose');
const Event = require('../models/Event');
const Category = require('../models/Category');
const User = require('../models/User');
require('dotenv').config();

// Sample events data organized by category
const eventTemplates = {
  music: [
    {
      title: "Summer Jazz Festival 2025",
      description: "Join us for an unforgettable evening of smooth jazz featuring renowned artists from around the world. Experience the magic of live music under the stars with food vendors, craft cocktails, and an atmosphere that celebrates the rich heritage of jazz music.",
      eventType: "festival",
      venue: "Central Park Amphitheater",
      city: "New York",
      state: "NY",
      price: 45,
      capacity: 500,
      tags: ["jazz", "music", "festival", "outdoor", "summer"],
      imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800"
    },
    {
      title: "Rock Concert: Electric Nights",
      description: "Get ready to rock! An electrifying night of hard rock and alternative music featuring local and touring bands. High-energy performances, amazing sound system, and an unforgettable experience for rock music lovers.",
      eventType: "concert",
      venue: "Madison Square Garden",
      city: "New York",
      state: "NY",
      price: 75,
      capacity: 300,
      tags: ["rock", "concert", "live music", "electric", "energy"],
      imageUrl: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800"
    }
  ],

  business: [
    {
      title: "Digital Marketing Summit 2025",
      description: "A comprehensive conference for marketing professionals featuring the latest trends in digital marketing, social media strategies, and emerging technologies. Network with industry leaders and gain insights that will transform your marketing approach.",
      eventType: "conference",
      venue: "Convention Center West",
      city: "San Francisco",
      state: "CA",
      price: 299,
      capacity: 1000,
      tags: ["marketing", "digital", "business", "networking", "technology"],
      imageUrl: "https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800"
    },
    {
      title: "Startup Pitch Competition",
      description: "Watch innovative startups pitch their ideas to a panel of experienced investors and industry experts. A great opportunity for entrepreneurs to showcase their vision and for attendees to discover the next big thing in business.",
      eventType: "meeting",
      venue: "Innovation Hub",
      city: "Austin",
      state: "TX",
      price: 25,
      capacity: 200,
      tags: ["startup", "entrepreneurship", "pitch", "innovation", "investment"],
      imageUrl: "https://images.unsplash.com/photo-1559223607-b4d0555ae227?w=800"
    }
  ],

  food: [
    {
      title: "Wine & Cheese Tasting Experience",
      description: "An elegant evening of wine and cheese pairings featuring selections from local vineyards and artisanal cheese makers. Learn about flavor profiles, pairing techniques, and enjoy a sophisticated culinary experience.",
      eventType: "class",
      venue: "The Wine Cellar",
      city: "Napa",
      state: "CA",
      price: 89,
      capacity: 40,
      tags: ["wine", "cheese", "tasting", "culinary", "elegant"],
      imageUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800"
    },
    {
      title: "Street Food Festival",
      description: "A celebration of diverse street food from around the world. Enjoy authentic flavors, live cooking demonstrations, and cultural performances while exploring a variety of cuisines in a vibrant festival atmosphere.",
      eventType: "festival",
      venue: "Downtown Plaza",
      city: "Los Angeles",
      state: "CA",
      price: 15,
      capacity: 2000,
      tags: ["street food", "festival", "cultural", "diverse", "outdoor"],
      imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800"
    }
  ],

  community: [
    {
      title: "Community Garden Workshop",
      description: "Learn sustainable gardening techniques and help build our community garden. A hands-on workshop covering organic farming, composting, and seasonal planting. All skill levels welcome, tools provided.",
      eventType: "class",
      venue: "Community Center Gardens",
      city: "Portland",
      state: "OR",
      price: 0,
      capacity: 30,
      tags: ["gardening", "sustainability", "community", "workshop", "organic"],
      imageUrl: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800"
    },
    {
      title: "Neighborhood Cultural Fair",
      description: "A vibrant celebration of our diverse community featuring cultural performances, traditional foods, art exhibitions, and activities for all ages. Experience the rich tapestry of cultures that make our neighborhood special.",
      eventType: "festival",
      venue: "Lincoln Park",
      city: "Chicago",
      state: "IL",
      price: 0,
      capacity: 1500,
      tags: ["cultural", "community", "diversity", "family", "celebration"],
      imageUrl: "https://images.unsplash.com/photo-1531058020387-3be344556be6?w=800"
    }
  ],

  "performing-arts": [
    {
      title: "Contemporary Dance Showcase",
      description: "An evening of innovative contemporary dance performances featuring emerging choreographers and dancers. Experience the beauty and emotion of modern dance in an intimate theater setting.",
      eventType: "concert",
      venue: "Modern Arts Theater",
      city: "Boston",
      state: "MA",
      price: 35,
      capacity: 150,
      tags: ["dance", "contemporary", "performance", "arts", "choreography"],
      imageUrl: "https://images.unsplash.com/photo-1518834107812-67b0b7c58434?w=800"
    },
    {
      title: "Shakespeare in the Park",
      description: "A classic outdoor performance of Romeo and Juliet in a beautiful park setting. Bring a blanket and enjoy this timeless tale under the stars. Free admission with donations welcome.",
      eventType: "concert",
      venue: "Riverside Park",
      city: "Seattle",
      state: "WA",
      price: 0,
      capacity: 300,
      tags: ["shakespeare", "theater", "outdoor", "classic", "free"],
      imageUrl: "https://images.unsplash.com/photo-1507924538820-ede94a04019d?w=800"
    }
  ],

  "film-media": [
    {
      title: "Independent Film Festival",
      description: "A three-day celebration of independent cinema featuring premieres, documentaries, and short films from emerging filmmakers. Panel discussions with directors and industry professionals included.",
      eventType: "screening",
      venue: "Indie Cinema Complex",
      city: "Miami",
      state: "FL",
      price: 120,
      capacity: 400,
      tags: ["film", "independent", "cinema", "documentary", "festival"],
      imageUrl: "https://images.unsplash.com/photo-1489599511788-b46a83b0f6b5?w=800"
    }
  ],

  sports: [
    {
      title: "5K Fun Run for Charity",
      description: "A community fun run supporting local charities. All fitness levels welcome! Includes post-race refreshments, awards ceremony, and family-friendly activities. Registration includes race t-shirt and medal.",
      eventType: "race",
      venue: "City Park Running Trail",
      city: "Denver",
      state: "CO",
      price: 25,
      capacity: 500,
      tags: ["running", "charity", "5k", "community", "fitness"],
      imageUrl: "https://images.unsplash.com/photo-1544717697-6d8cbde3baed?w=800"
    },
    {
      title: "Basketball Tournament - Summer League",
      description: "Annual summer basketball tournament featuring teams from across the region. Competitive games, food trucks, and entertainment for the whole family. Championship game on Sunday evening.",
      eventType: "tournament",
      venue: "Sports Complex Arena",
      city: "Phoenix",
      state: "AZ",
      price: 12,
      capacity: 800,
      tags: ["basketball", "tournament", "summer", "competition", "sports"],
      imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800"
    }
  ],

  health: [
    {
      title: "Mindfulness & Meditation Workshop",
      description: "Learn practical mindfulness and meditation techniques to reduce stress and improve well-being. Suitable for beginners and experienced practitioners. Includes guided sessions and take-home resources.",
      eventType: "class",
      venue: "Wellness Center",
      city: "San Diego",
      state: "CA",
      price: 45,
      capacity: 25,
      tags: ["mindfulness", "meditation", "wellness", "stress-relief", "mental-health"],
      imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800"
    }
  ],

  "science-tech": [
    {
      title: "AI & Machine Learning Conference 2025",
      description: "Explore the future of artificial intelligence and machine learning with industry experts, researchers, and innovators. Hands-on workshops, keynote presentations, and networking opportunities.",
      eventType: "conference",
      venue: "Tech Innovation Center",
      city: "San Jose",
      state: "CA",
      price: 449,
      capacity: 750,
      tags: ["AI", "machine-learning", "technology", "innovation", "conference"],
      imageUrl: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800"
    },
    {
      title: "Robotics Workshop for Kids",
      description: "An engaging hands-on workshop where kids learn basic robotics and programming concepts. Build and program your own robot to take home! Perfect for curious young minds aged 8-14.",
      eventType: "class",
      venue: "STEM Learning Lab",
      city: "Dallas",
      state: "TX",
      price: 65,
      capacity: 20,
      tags: ["robotics", "kids", "STEM", "programming", "education"],
      imageUrl: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800"
    }
  ],

  "travel-outdoor": [
    {
      title: "Mountain Hiking Adventure",
      description: "Join experienced guides for a day of hiking through scenic mountain trails. All skill levels welcome. Includes transportation, lunch, and professional photography of your adventure.",
      eventType: "tour",
      venue: "Rocky Mountain Trailhead",
      city: "Boulder",
      state: "CO",
      price: 89,
      capacity: 15,
      tags: ["hiking", "mountains", "outdoor", "adventure", "nature"],
      imageUrl: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=800"
    }
  ],

  charity: [
    {
      title: "Annual Charity Gala - Education for All",
      description: "An elegant evening supporting educational initiatives for underprivileged children. Features dinner, live auction, entertainment, and inspiring speakers. Formal attire requested.",
      eventType: "dinner",
      venue: "Grand Ballroom Hotel",
      city: "Atlanta",
      state: "GA",
      price: 150,
      capacity: 300,
      tags: ["charity", "gala", "education", "fundraising", "formal"],
      imageUrl: "https://images.unsplash.com/photo-1519671282429-b44660ead0a7?w=800"
    }
  ],

  religion: [
    {
      title: "Interfaith Dialogue: Building Bridges",
      description: "A peaceful gathering bringing together people of different faiths to share perspectives, learn from each other, and build understanding in our diverse community. Light refreshments provided.",
      eventType: "meeting",
      venue: "Community Interfaith Center",
      city: "Minneapolis",
      state: "MN",
      price: 0,
      capacity: 100,
      tags: ["interfaith", "dialogue", "community", "understanding", "peace"],
      imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800"
    }
  ],

  "family-education": [
    {
      title: "Family Science Discovery Day",
      description: "A fun-filled day of hands-on science experiments and activities for families. Kids and parents explore physics, chemistry, and biology together through engaging demonstrations and interactive exhibits.",
      eventType: "class",
      venue: "Science Discovery Museum",
      city: "Orlando",
      state: "FL",
      price: 20,
      capacity: 200,
      tags: ["family", "science", "education", "kids", "interactive"],
      imageUrl: "https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=800"
    }
  ],

  seasonal: [
    {
      title: "Winter Holiday Market",
      description: "A festive winter market featuring local artisans, holiday treats, hot beverages, and live music. Find unique gifts while enjoying the magic of the holiday season in a warm, family-friendly atmosphere.",
      eventType: "festival",
      venue: "Town Square",
      city: "Burlington",
      state: "VT",
      price: 0,
      capacity: 1000,
      tags: ["holiday", "winter", "market", "artisan", "festive"],
      imageUrl: "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800"
    }
  ],

  government: [
    {
      title: "Town Hall: Community Budget Planning",
      description: "Join local officials and community members to discuss the upcoming municipal budget. Your voice matters in decisions about public services, infrastructure, and community programs.",
      eventType: "meeting",
      venue: "City Council Chambers",
      city: "Madison",
      state: "WI",
      price: 0,
      capacity: 150,
      tags: ["town-hall", "government", "budget", "civic", "community"],
      imageUrl: "https://images.unsplash.com/photo-1517463682423-684e684e7e16?w=800"
    }
  ],

  fashion: [
    {
      title: "Sustainable Fashion Show",
      description: "Discover the future of fashion with a runway show featuring eco-friendly designers and sustainable clothing brands. Learn about ethical fashion while enjoying creative designs and innovative materials.",
      eventType: "concert",
      venue: "Fashion District Gallery",
      city: "Los Angeles",
      state: "CA",
      price: 55,
      capacity: 200,
      tags: ["fashion", "sustainable", "eco-friendly", "runway", "design"],
      imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800"
    }
  ],

  "home-lifestyle": [
    {
      title: "Home Renovation & Design Expo",
      description: "Explore the latest trends in home improvement, interior design, and smart home technology. Meet contractors, designers, and vendors. Includes workshops on DIY projects and design consultations.",
      eventType: "tradeshow",
      venue: "Exhibition Center",
      city: "Nashville",
      state: "TN",
      price: 15,
      capacity: 2500,
      tags: ["home", "renovation", "design", "expo", "DIY"],
      imageUrl: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800"
    }
  ],

  "auto-boat-air": [
    {
      title: "Classic Car Show & Swap Meet",
      description: "A celebration of automotive history featuring classic cars, vintage motorcycles, and automotive memorabilia. Perfect for car enthusiasts and families. Includes food trucks and live music.",
      eventType: "tradeshow",
      venue: "Fairgrounds Exhibition Hall",
      city: "Detroit",
      state: "MI",
      price: 12,
      capacity: 1000,
      tags: ["classic-cars", "automotive", "vintage", "swap-meet", "collectors"],
      imageUrl: "https://images.unsplash.com/photo-1493238792000-8113da705763?w=800"
    }
  ],

  hobbies: [
    {
      title: "Board Game Convention - GameFest 2025",
      description: "Three days of board gaming with tournaments, new game previews, and opportunities to play hundreds of games. Meet designers, participate in contests, and discover your next favorite game.",
      eventType: "convention",
      venue: "Convention Center East",
      city: "Indianapolis",
      state: "IN",
      price: 65,
      capacity: 800,
      tags: ["board-games", "convention", "gaming", "tournaments", "hobby"],
      imageUrl: "https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?w=800"
    }
  ],

  school: [
    {
      title: "High School Science Fair",
      description: "Student scientists showcase their research projects and experiments. Support young innovators and see the future of science in action. Awards ceremony at 3 PM with refreshments for all attendees.",
      eventType: "tradeshow",
      venue: "Lincoln High School Gymnasium",
      city: "Springfield",
      state: "IL",
      price: 0,
      capacity: 300,
      tags: ["science-fair", "students", "education", "research", "innovation"],
      imageUrl: "https://images.unsplash.com/photo-1532619187608-e5375cab36aa?w=800"
    }
  ]
};

// Helper function to generate random dates
function getRandomFutureDate(daysFromNow = 7, maxDaysFromNow = 90) {
  const start = new Date();
  start.setDate(start.getDate() + daysFromNow);

  const end = new Date();
  end.setDate(end.getDate() + maxDaysFromNow);

  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Function to create a sample organizer user
async function createSampleOrganizer() {
  try {
    // Check if sample organizer already exists
    let organizer = await User.findOne({ email: 'event.organizer@sample.com' });

    if (!organizer) {
      organizer = new User({
        firstName: 'Event',
        lastName: 'Organizer',
        username: 'eventorganizer',
        email: 'event.organizer@sample.com',
        password: 'hashedPassword123', // In real app, this would be properly hashed
        role: 'organizer',
        isVerified: true,
        profileComplete: true
      });
      await organizer.save();
      console.log('Created sample organizer user');
    }

    return organizer._id;
  } catch (error) {
    console.error('Error creating sample organizer:', error);
    throw error;
  }
}

// Function to seed events
async function seedEvents() {
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

    console.log('Connected to MongoDB for event seeding...');

    // Create sample organizer
    const organizerId = await createSampleOrganizer();

    // Clear existing events
    await Event.deleteMany({});
    console.log('Cleared existing events');

    const eventsToCreate = [];

    // Generate events for each category
    for (const [category, templates] of Object.entries(eventTemplates)) {
      console.log(`Creating events for category: ${category}`);

      for (const template of templates) {
        const startDate = getRandomFutureDate();
        const endDate = new Date(startDate.getTime() + (3 * 60 * 60 * 1000)); // 3 hours later

        const eventData = {
          title: template.title,
          description: template.description,
          category: category,
          eventType: template.eventType,
          organizer: organizerId,
          organizerInfo: {
            name: 'Event Organizer',
            email: 'event.organizer@sample.com'
          },
          dateTime: {
            start: startDate,
            end: endDate,
            timezone: 'America/New_York'
          },
          location: {
            type: 'venue',
            venue: {
              name: template.venue,
              address: {
                street: '123 Event Street',
                city: template.city,
                state: template.state,
                country: 'United States',
                zipCode: '12345'
              }
            }
          },
          pricing: {
            type: template.price > 0 ? 'paid' : 'free',
            amount: template.price,
            currency: 'USD',
            ticketClasses: template.price > 0 ? [{
              id: new mongoose.Types.ObjectId().toString(),
              name: 'General Admission',
              type: 'paid',
              cost: {
                value: template.price * 100, // Convert to cents
                currency: 'USD',
                display: `USD,${template.price * 100}`
              },
              quantity: {
                total: template.capacity,
                sold: Math.floor(Math.random() * template.capacity * 0.3), // Random sold tickets
                reserved: 0
              },
              restrictions: {
                minimumQuantity: 1,
                maximumQuantity: 10,
                requiresApproval: false
              },
              sales: {
                start: new Date(),
                end: new Date(startDate.getTime() - (24 * 60 * 60 * 1000)), // End sales 1 day before event
                hideSaleDates: false
              },
              visibility: {
                hidden: false,
                autoHide: false
              },
              salesChannels: ['online'],
              deliveryMethods: ['electronic'],
              fees: {
                includeFee: false,
                absorptionType: 'pass_fee'
              },
              description: 'Standard admission ticket',
              order: 0
            }] : []
          },
          images: [{
            url: template.imageUrl,
            isPrimary: true
          }],
          tags: template.tags,
          status: Math.random() > 0.3 ? 'published' : 'draft', // 70% published, 30% draft
          visibility: 'public',
          featured: Math.random() > 0.8, // 20% featured
          views: Math.floor(Math.random() * 1000),
          shares: Math.floor(Math.random() * 50),
          attendees: [],
          likes: [],
          publishedAt: Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : null // Random publish date in last 30 days
        };

        eventsToCreate.push(eventData);
      }
    }

    // Insert all events
    const createdEvents = await Event.insertMany(eventsToCreate);
    console.log(`Created ${createdEvents.length} sample events`);

    // Display summary by category
    console.log('\n=== EVENT SEEDING SUMMARY ===');
    for (const [category, templates] of Object.entries(eventTemplates)) {
      console.log(`${category}: ${templates.length} events`);
    }

    console.log(`\nTotal Events Created: ${createdEvents.length}`);
    console.log(`Published Events: ${createdEvents.filter(e => e.status === 'published').length}`);
    console.log(`Draft Events: ${createdEvents.filter(e => e.status === 'draft').length}`);
    console.log(`Featured Events: ${createdEvents.filter(e => e.featured).length}`);

    process.exit(0);

  } catch (error) {
    console.error('Error seeding events:', error);
    process.exit(1);
  }
}

// Run the seeding function
if (require.main === module) {
  seedEvents();
}

module.exports = { seedEvents, eventTemplates };