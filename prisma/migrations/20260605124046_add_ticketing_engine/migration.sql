/*
  Warnings:

  - A unique constraint covering the columns `[userId,eventId]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Ticket_userId_eventId_key" ON "Ticket"("userId", "eventId");
