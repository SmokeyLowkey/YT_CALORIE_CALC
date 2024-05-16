"use client";
import React, { useState } from "react";
import axios from "axios";
import Skeleton from "@/components/SkeletonLoader";

// Define TypeScript interfaces for better type safety
interface VideoDetail {
  description: string;
}

interface METData {
  activity: string;
  duration: number;
  MET: number;
  calories: number;
}

interface CalculationResult {
  totalCalories: number;
  exercises: METData[];
}

const CalorieCalc: React.FC = () => {
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");
  const [weight, setWeight] = useState<number>(114);
  const [weightUnit, setWeightUnit] = useState("kg"); // Default to kilograms
  const [restInterval, setRestInterval] = useState<number>(20); // Default 15 seconds rest interval
  const [totalCaloriesBurned, setTotalCaloriesBurned] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [exerciseDetails, setExerciseDetails] = useState<METData[]>([]);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [editableExercises, setEditableExercises] = useState<METData[]>([]);

  const handleDeleteExercise = (index: number) => {
    const updatedExercises = editableExercises.filter(
      (_, idx) => idx !== index,
    );
    setEditableExercises(updatedExercises);
  };

  const toggleEditMode = () => {
    if (!editMode) {
      // Only clone and enter edit mode if not already editing
      setEditableExercises([...exerciseDetails]);
      setEditMode(true);
    } else {
      // Attempt to save changes when exiting edit mode
      handleSaveChanges(); // Ensure this method properly updates and saves
    }
  };

  const handleSaveChanges = async () => {
    setLoading(true);
    try {
      const updatedMETs = await fetchMETValues(editableExercises); // Fetch new MET values
      const result = calculateTotalCalories(updatedMETs, weight, restInterval, weightUnit);
      setExerciseDetails(result.exercises); // Update the main exercises array
      setTotalCaloriesBurned(result.totalCalories);
      setEditMode(false); // Exit edit mode after saving
      setError("");
    } catch (error) {
      console.error("Failed to fetch or calculate new MET values:", error);
      setError("Failed to update exercises.");
      setEditMode(true); // Stay in edit mode if there is an error
    }
    setLoading(false);
  };

  const handleExerciseChange = (
    index: number,
    field: keyof METData,
    value: any,
  ) => {
    const updatedExercises = editableExercises.map((exercise, idx) => {
      if (idx === index) {
        return { ...exercise, [field]: value };
      }
      return exercise;
    });
    setEditableExercises(updatedExercises);
  };

  const handleAddExercise = () => {
    const newExercise = {
      activity: "",
      duration: 0,
      MET: 0,
      calories: 0,
    };
    setEditableExercises([...editableExercises, newExercise]);
  };

  // Extract the video ID from the YouTube URL
  const extractVideoID = (url: string): string | null => {
    const regExp =
      /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    const match = url.match(regExp);
    return match && match[7].length === 11 ? match[7] : null;
  };
  const videoId = extractVideoID(youtubeUrl);

  // Fetch video details from YouTube API
  const fetchYouTubeVideoDetails = async (videoID: string) => {
    // console.log("Fetching details for video ID:", videoID); // Log the video ID being fetched
    // setLoading(true);
    try {
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos`,
        {
          params: {
            part: "snippet",
            id: videoID,
            key: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY,
          },
        },
      );
      setLoading(false);
      return response.data.items[0].snippet;
    } catch (err) {
      console.error("Error fetching YouTube video details:", err);
      setError("Failed to fetch video details");
      //   setLoading(false);
      return null;
    }
  };

  async function getMETValues(description: string): Promise<METData[]> {
    setLoading(true); // Start loading before the API request
    // console.log("Sending description to ChatGPT:", description); // Log the description sent to ChatGPT
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Extract exercise names, their estimated MET values, and durations in seconds ('duration'). Each exercise is marked by a timestamp. Calculate the duration by comparing the timestamps sequentially and keep in mind the rest time which will subtract from the duration. If there are no time stamps look for any time indicators pertaining to the workout and use that. Output the information in a structured JSON format, ensuring each exercise that includes a timestamp is considered.",
            },
            { role: "user", content: description },
          ],
          max_tokens: 2500,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );
      setLoading(false);

      return parseMETData(response.data.choices[0].message.content);
    } catch (error) {
      console.error("Error fetching MET values from ChatGPT:", error);
      setLoading(false);
      return [];
    }
  }

  const fetchMETValues = async (exercises: METData[]): Promise<METData[]> => {
    const descriptions = exercises
      .map((ex) => `${ex.activity} for ${ex.duration} seconds`)
      .join(", ");
    setLoading(true);

    console.log("Sending updated exercises to ChatGPT:", exercises);

    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "recalculate the MET values for these exercises and provide the result in JSON format while keeping the same structure of json.",
            },
            { role: "user", content: descriptions },
          ],
          max_tokens: 2500,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );
      setLoading(false);
      const metData = parseMETData(response.data.choices[0].message.content);
      return exercises.map((exercise, index) => ({
        ...exercise,
        MET: metData[index].MET,
      }));
    } catch (error) {
      console.error("Error fetching MET values from ChatGPT:", error);
      setLoading(false);
      return [];
    }
  };

  function parseMETData(chatGptResponse: string): METData[] {
    try {
      // console.log("Received string for parsing:", chatGptResponse);
      const cleanText = chatGptResponse.replace(/(```json|```)/g, "").trim();
      const data = JSON.parse(cleanText);
      //   console.log("cleaned text: ", cleanText);
      //   console.log("data: ", data);
      return data.exercises.map((exercise: any) => ({
        activity: exercise.name,
        MET: exercise.MET,
        duration: exercise.duration,
      }));
    } catch (error) {
      console.error(
        "Error parsing MET data:",
        error,
        "Received string:",
        chatGptResponse,
      );
      console.error("Faulty JSON data:", chatGptResponse);
      return [];
    }
  }

  // Handle the calculation on button click
  const handleCalculate = async () => {
    // console.log("handleCalculate triggered"); // Check if function is triggered
    setError("");
    setLoading(true);
    setTotalCaloriesBurned(0); // Reset calorie count
    const videoID = extractVideoID(youtubeUrl);
    // console.log("Extracted video ID:", videoID); // Check the extracted ID
    if (videoID) {
      //   console.log("Valid video ID, fetching details..."); // Confirming next step
      const details = await fetchYouTubeVideoDetails(videoID);
      if (details && details.description) {
        // console.log("Video details fetched, extracting MET values...");
        const metData = await getMETValues(details.description);
        // console.log("MET Data:", metData); // See what MET data looks like
        if (metData.length > 0) {
          const { totalCalories, exercises } = calculateTotalCalories(
            metData,
            weight,
            restInterval,
            weightUnit,
          );
          setTotalCaloriesBurned(totalCalories);
          setExerciseDetails(exercises);
        } else {
          setError("No Exercises found in the video description.");
        }
      } else {
        console.log("No video details available"); // Error handling
        setError("Failed to fetch video details");
      }
    } else {
      setError("Invalid YouTube URL");
      console.log("Invalid YouTube URL entered"); // Error handling
    }
    setLoading(false);
  };

  const calculateTotalCalories = (
    metData: METData[],
    inputWeight: number,
    restInterval: number,
    weightUnit: string
  ): CalculationResult => {
    let exercises: METData[] = [];
    const weightInKg =
      weightUnit === "lbs" ? inputWeight / 2.20462 : inputWeight;
    let totalCalories = 0;
    metData.forEach((exercise) => {
      const effectiveDuration = Math.max(0, exercise.duration - restInterval);
      if (effectiveDuration > 0) {
        
        const caloriesPerMinute = ((exercise.MET * 3.5) * weightInKg) / 200;
        const caloriesForExercise =
          caloriesPerMinute * (effectiveDuration / 60);
        totalCalories += caloriesForExercise;
        exercises.push({ ...exercise, calories: caloriesForExercise });
      }
    });
    return { totalCalories, exercises };
  };

  const ExerciseDetailSkeletons = () => (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex justify-between items-center p-2">
          <Skeleton className="w-1/3 h-6" />
          <Skeleton className="w-1/4 h-6" />
          <Skeleton className="w-1/6 h-6" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col justify-between p-10  space-x-4">
      <div className="flex flex-row justify-between p-10 space-x-4">
        {loading ? (
          <div className="loading-screen">Calculating...</div>
        ) : (
          <form className="w-1/2 space-y-4">
            <div>
              <label
                htmlFor="youtube-url"
                className="block text-sm font-medium text-gray-500"
              >
                YouTube URL:
              </label>

              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="mt-1 text-gray-800 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="YouTube URL"
              />
            </div>
            <div>
              <label
                htmlFor="weight"
                className="block text-sm font-medium text-gray-500"
              >
                Weight ({weightUnit}):
              </label>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                placeholder={`Weight in ${weightUnit}`}
                className="mt-1  text-gray-800 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <button
                onClick={(e) =>{
                    e.preventDefault(); // Prevent form submission or page reload
                  setWeightUnit(weightUnit === "kg" ? "lbs" : "kg")
                }}
                className="mt-2 text-purple-500 hover:text-indigo-700 font-medium"
              >
                Switch to {weightUnit === "kg" ? "lbs" : "kg"}
              </button>
            </div>
            <div>
              <label
                htmlFor="rest"
                className="block text-sm font-medium text-gray-500"
              >
                Rest Interval (s):
              </label>
              <input
                type="number"
                value={restInterval}
                onChange={(e) => setRestInterval(Number(e.target.value))}
                placeholder="Rest interval in seconds"
                className="mt-1  text-gray-800 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            <button
              onClick={handleCalculate}
              disabled={loading}
              className="items-center hover:bg-green-300 p-2 bg-transparent border-4 rounded-lg mb-2 shadow"
            >
              {/* {loading ? "Calculating..." : "Calculate Calories"} */}
              <p className="text-purple-500">Calculate Calories &#128074;</p>
            </button>
            <p className="text-xl"> Total Calories Burned: </p>
            {totalCaloriesBurned > 0 && (
              <p className="text-6xl text-lime-500">
                {totalCaloriesBurned.toFixed(2)}
              </p>
            )}
            {error && <p style={{ color: "red" }}>{error}</p>}
          </form>
        )}

        {videoId && (
          <div className="w-1/2">
            <iframe
              title="YouTube Video"
              className="w-full h-80"
              src={`https://www.youtube.com/embed/${videoId}`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        )}
      </div>
      <div>
        {loading ? (
          <ExerciseDetailSkeletons />
        ) : (
          <div className="exercise-breakdown mt-6">
            <p className="text-2xl px-5">Exercise Breakdown</p>
            {(editMode ? editableExercises : exerciseDetails).map(
              (exercise, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-2 bg-gray-100 rounded-lg mb-2 shadow"
                >
                  {editMode ? (
                    <>
                      <input
                        type="text"
                        value={exercise.activity}
                        onChange={(e) =>
                          handleExerciseChange(
                            index,
                            "activity",
                            e.target.value,
                          )
                        }
                        className="input border-2 p-1 rounded"
                      />
                      <input
                        type="number"
                        value={exercise.duration}
                        onChange={(e) =>
                          handleExerciseChange(
                            index,
                            "duration",
                            parseInt(e.target.value),
                          )
                        }
                        className="input w-20 border-2 p-1 rounded"
                      />
                      <button
                        onClick={() => handleDeleteExercise(index)}
                        className="ml-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded"
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-black font-semibold">
                        {exercise.activity}
                      </span>
                      <span className="text-black">
                        {exercise.duration} seconds
                      </span>
                      <span className="font-bold text-green-700">
                        {exercise.calories.toFixed(2)} calories
                      </span>
                    </>
                  )}
                </div>
              ),
            )}
            <div className="flex justify-end mt-2">
              {editMode && (
                <button
                  onClick={handleAddExercise}
                  className="mt-2 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
                >
                  Add New Exercise
                </button>
              )}
            </div>
            {editMode ? (
              <button
                onClick={handleSaveChanges}
                className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Save Changes
              </button>
            ) : (
              <button
                onClick={toggleEditMode}
                className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CalorieCalc;
