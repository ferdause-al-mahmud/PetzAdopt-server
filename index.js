const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const port = process.env.PORT || 8000
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dnxxphb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
})

async function run() {
    try {

        const petsCollection = client.db("petzAdopt").collection("pets");
        const adoptCollection = client.db("petzAdopt").collection("adopts");
        const usersCollection = client.db("petzAdopt").collection("users");
        const campaignCollection = client.db("petzAdopt").collection("donationCampaigns");
        const paymentCollection = client.db("petzAdopt").collection("payments");


        // jwt
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                // console.log('No authorization header');
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    // console.log('Token verification failed', err);
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.decoded = decoded;
                // console.log('Token verified successfully');
                next();
            });
        };

        //pets
        app.get('/pets', async (req, res) => {
            const category = req.query?.category;
            let name = req.query?.name;
            let query = { adopted: false };

            if (name) {
                name = new RegExp(name, 'i');
                query = { ...query, petName: name };
            }
            if (category) {
                query = { ...query, category: category };
            }
            // console.log(query)
            const options = {
                sort: { addedTime: -1 },
            };
            const result = await petsCollection.find(query, options).toArray();
            res.send(result);
        });


        app.get('/pets/:id', async (req, res) => {
            const petId = req?.params?.id;
            // console.log(petId)
            const query = { _id: new ObjectId(petId) };
            const result = await petsCollection.findOne(query);
            res.send(result)
        })

        app.get('/pets-added/:email', async (req, res) => {
            const email = req?.params?.email;
            const query = { adderEmail: email };
            const result = await petsCollection.find(query).toArray();
            res.send(result)
        })
        //pet adding
        app.post('/pets', async (req, res) => {
            const item = req.body;
            const result = await petsCollection.insertOne(item);
            res.send(result);
        });
        //pet updating
        app.put('/pets/update/:id', async (req, res) => {
            const id = req.params.id;
            const updatedDetails = req.body;

            try {
                const filter = { _id: new ObjectId(id) };
                const updateDoc = { $set: updatedDetails };

                const result = await petsCollection.updateOne(filter, updateDoc);
                if (result.modifiedCount === 1) {
                    res.json({ message: 'Pet details updated successfully' });
                } else {
                    res.status(404).json({ message: 'Pet not found or details already updated' });
                }
            } catch (error) {
                console.error('Error updating pet details:', error);
                res.status(500).json({ message: 'An error occurred while updating the pet details' });
            }
        });
        //updating adoption status
        app.patch('/pets/adopt/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    adopted: true
                }
            }
            const result = await petsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })
        //pet deleting
        app.delete('/pets/delete/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const result = await petsCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 1) {
                    res.json({ message: 'Pet deleted successfully' });
                }
            } catch (error) {
                console.error('Error deleting pet:', error);
                res.status(500).json({ message: 'An error occurred while deleting the pet' });
            }
        });
        //adopting
        app.post('/adopts', async (req, res) => {
            const requestedPet = req.body;
            const query = { email: requestedPet?.email, petId: requestedPet?.petId };

            const isExist = await adoptCollection.findOne(query);
            if (isExist) {
                // console.log("already exist");
                res.status(409).send({ message: "Already exist" });
            } else {
                const result = await adoptCollection.insertOne(requestedPet);
                res.status(201).send(result);
            }
        });

        //Campaigns


        app.get('/campaigns', async (req, res) => {
            const options = {
                sort: { addedTime: -1 },
            };
            const result = await campaignCollection.find({}, options).toArray();
            res.send(result);
        });
        app.get('/campaigns/:id', async (req, res) => {
            const campaignId = req?.params?.id;
            console.log(campaignId)
            const query = { _id: new ObjectId(campaignId) };
            const result = await campaignCollection.findOne(query);
            res.send(result)
        })
        app.get('/campaigns/my-added/:email', async (req, res) => {
            const email = req?.params?.email;
            // console.log(campaignId)
            const query = { adderEmail: email };
            const result = await campaignCollection.find(query).toArray();
            res.send(result)
        })
        app.post('/campaign', async (req, res) => {
            const campaign = req.body;
            const result = await campaignCollection.insertOne(campaign);
            res.send(result);
        });

        app.patch('/campaign/pause/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const filter = { _id: new ObjectId(id) };
            try {
                const campaign = await campaignCollection.findOne(filter);
                if (!campaign) {
                    return res.status(404).send({ error: 'Campaign not found' });
                }
                console.log(campaign)
                const updatedDoc = {
                    $set: {
                        pause: !campaign.pause
                    }
                };

                const result = await campaignCollection.updateOne(filter, updatedDoc);
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: 'An error occurred while updating the campaign' });
            }
        })

        //update campaign
        app.put('/campaign/update/:id', async (req, res) => {
            const id = req.params.id;
            const updatedDetails = req.body;

            try {
                const filter = { _id: new ObjectId(id) };
                const updateDoc = { $set: updatedDetails };

                const result = await campaignCollection.updateOne(filter, updateDoc);
                if (result.modifiedCount === 1) {
                    res.json({ message: 'Campaign details updated successfully' });
                } else {
                    res.status(404).json({ message: 'Campaign not found or details already updated' });
                }
            } catch (error) {
                console.error('Error updating Campaign details:', error);
                res.status(500).json({ message: 'An error occurred while updating the Campaign details' });
            }
        });
        // save a user data in db
        app.put('/user', async (req, res) => {
            const user = req.body
            const query = { email: user?.email }
            // check if user already exists in db
            const isExist = await usersCollection.findOne(query)
            if (isExist) {
                if (user.status === 'Requested') {
                    // if existing user try to change his role
                    const result = await usersCollection.updateOne(query, {
                        $set: { status: user?.status },
                    })
                    return res.send(result)
                } else {
                    // if existing user login again
                    return res.send(isExist)
                }
            }

            // save user for the first time
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...user,
                    timestamp: Date.now(),
                },
            }
            const result = await usersCollection.updateOne(query, updateDoc, options)
            res.send(result)
        })

        //payment intent

        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: 'usd',
                    payment_method_types: ["card"],
                });
                res.send({
                    clientSecret: paymentIntent.client_secret,
                })
            } catch (error) {
                console.error('Error creating payment intent:', error);
                res.status(500).send({ error: 'Payment intent creation failed' });
            }
        });



        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const { campaignId, amount } = payment;
            const amountNumber = parseFloat(amount);

            const query = {
                _id: new ObjectId(campaignId)
            }
            try {
                const paymentResult = await paymentCollection.insertOne(payment);
                const campaign = await campaignCollection.findOne(query);
                const donatedAmountNumber = parseFloat(campaign.donatedAmount || 0);
                const newDonatedAmount = amountNumber + donatedAmountNumber;

                const updatedCampaign = await campaignCollection.findOneAndUpdate(
                    query,
                    { $set: { donatedAmount: newDonatedAmount.toString() } },
                    { returnOriginal: false }
                );

                res.send(updatedCampaign.value);
            } catch (error) {
                console.error("Error processing payment:", error);
                res.status(500).send("Error processing payment");
            }

        });
        app.get('/donors/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const query = { campaignId: id };
            const result = await paymentCollection.find(query).toArray();
            res.send(result)

        })
        // Send a ping to confirm a successful connection
        // await client.db('admin').command({ ping: 1 })
        console.log(
            'Pinged your deployment. You successfully connected to MongoDB!'
        )
    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello from PetzAdopt Server..')
})

app.listen(port, () => {
    console.log(`PetzAdopt is running on port ${port}`)
})
