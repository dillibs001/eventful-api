# 🎟️ Eventful API

Eventful is more than just a ticketing platform; it’s your passport to a world of unforgettable moments. From pulsating concerts to captivating theater performances, and thrilling sports events to enlightening cultural gatherings, we curate a diverse array of experiences that cater to every taste and passion.

This repository contains the backend RESTful API powering the Eventful platform, built with scalability, security, and performance in mind.

## 🚀 Tech Stack

* **Runtime & Framework:** Node.js, NestJS, TypeScript
* **Database & ORM:** PostgreSQL, Prisma ORM
* **Caching & Queues:** Redis, BullMQ
* **Payment Integration:** Paystack
* **Testing:** Jest (Unit & Integration)
* **Documentation:** Swagger / OpenAPI

## ✨ Core Features

* **Authentication & Authorization:** Secure Role-Based Access Control (RBAC) utilizing JWTs. Distinct privileges for `Event Creators` and `Eventees`.
* **Dynamic QR Code Ticketing:** Automated generation of verifiable QR codes upon successful ticket purchase to manage event access and prevent fraud.
* **Automated Notifications:** Flexible, scheduled background jobs to send event reminders to both creators and attendees (e.g., 1 day or 1 week before the event).
* **Payment Processing:** Seamless and secure checkout flow utilizing Paystack webhooks to verify transactions in real-time.
* **Real-time Analytics:** Dashboard endpoints for creators to track ticket sales, total revenue, and live scan counts, optimized with a Redis caching layer.
* **Social Shareability:** Optimized endpoints to support rich social media sharing for upcoming events.

## 🛠️ Getting Started

### Prerequisites
* Node.js (v18+ recommended)
* PostgreSQL
* Redis

### Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/dillibs001/eventful-api.git](https://github.com/yourusername/eventful-api.git)
   cd eventful-api
   ```
2. Install dependencies:
```
Bash
npm install
```

3. Set up environment variables:
Duplicate the ```.env.example``` file to ```.env``` and fill in your local configurations:
```
Bash
cp .env.example .env
```
4. Run database migrations:
```
Bash
npx prisma migrate dev
```
5. Start the development server:
```
Bash
npm run start:dev
```

   🧪 Testing
To run the test suite (unit and integration tests):
```
Bash
# Run unit tests
npm run test

# Run e2e/integration tests
npm run test:e2e
```

## 📚 API Documentation
Once the server is running, the interactive Swagger API documentation can be accessed at:
```http://localhost:3000/api/docs```
Developed as a Capstone Project for AltSchool Africa.
