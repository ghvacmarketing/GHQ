import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Calendar, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { format, addDays, isBefore, startOfDay } from "date-fns";

const SERVICE_CALL_PRICE = 147;
const CONSULTATION_PRICE = 0;

const PROBLEM_OPTIONS = [
  "No cooling",
  "No Heating",
  "Thermostat issue",
  "Low airflow",
  "System water leak",
  "System is making noise",
  "Other issue",
];

const SYSTEM_TYPES = [
  "Central Air (Split System)",
  "Heat Pump",
  "Ductless Mini Split",
  "Package Unit",
  "Furnace",
  "Boiler",
  "I'm not sure",
];

const TIME_SLOTS = [
  { label: "9 AM - 11 AM", value: "09:00-11:00" },
  { label: "11 AM - 1 PM", value: "11:00-13:00" },
  { label: "1 PM - 3 PM", value: "13:00-15:00" },
  { label: "3 PM - 5 PM", value: "15:00-17:00" },
];

const SERVICE_AREA_ZIPS = [
  "30901", "30904", "30905", "30906", "30907", "30909", "30912",
  "30813", "30814", "30815", "30816", "30817",
  "30802", "30803", "30805", "30808", "30809",
  "30820", "30821", "30823", "30824", "30828", "30830",
  "30833", "30901", "30903", "30904", "30905", "30906", "30907",
  "30809", "30813", "30815", "30816", "30817", "30819",
];

type Step = "zip" | "service" | "problem" | "system" | "datetime" | "info" | "confirm";

interface BookingData {
  zipCode: string;
  serviceType: "service_call" | "consultation";
  problems: string[];
  systemType: string;
  selectedDate: Date | null;
  selectedTimeSlot: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
}

export default function BookOnline() {
  const [step, setStep] = useState<Step>("zip");
  const [data, setData] = useState<BookingData>({
    zipCode: "",
    serviceType: "service_call",
    problems: [],
    systemType: "",
    selectedDate: null,
    selectedTimeSlot: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    notes: "",
  });
  const [dateOffset, setDateOffset] = useState(0);
  const [zipError, setZipError] = useState("");

  const submitBooking = useMutation({
    mutationFn: async (bookingData: BookingData) => {
      const response = await apiRequest("POST", "/api/public/book", bookingData);
      return response.json();
    },
    onSuccess: () => {
      setStep("confirm");
    },
  });

  const handleNext = () => {
    const stepOrder: Step[] = ["zip", "service", "problem", "system", "datetime", "info"];
    const currentIndex = stepOrder.indexOf(step);
    
    if (currentIndex < stepOrder.length - 1) {
      setStep(stepOrder[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const stepOrder: Step[] = ["zip", "service", "problem", "system", "datetime", "info"];
    const currentIndex = stepOrder.indexOf(step);
    
    if (currentIndex > 0) {
      setStep(stepOrder[currentIndex - 1]);
    }
  };

  const handleSubmit = () => {
    submitBooking.mutate(data);
  };

  const getAvailableDates = () => {
    const dates: Date[] = [];
    const today = startOfDay(new Date());
    const leadDays = data.serviceType === "service_call" ? 2 : 3;
    
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, leadDays + i + dateOffset);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0) {
        dates.push(date);
      }
    }
    return dates.slice(0, 7);
  };

  const validateZip = () => {
    if (SERVICE_AREA_ZIPS.includes(data.zipCode)) {
      setZipError("");
      handleNext();
    } else {
      setZipError("Sorry, we don't currently service this area. Please call us at (706) 826-0644 for assistance.");
    }
  };

  const canProceed = () => {
    switch (step) {
      case "zip":
        return data.zipCode.length === 5;
      case "service":
        return true;
      case "problem":
        return data.serviceType === "consultation" || data.problems.length > 0;
      case "system":
        return data.serviceType === "consultation" || data.systemType !== "";
      case "datetime":
        return data.selectedDate !== null && data.selectedTimeSlot !== "";
      case "info":
        return data.firstName && data.lastName && data.email && data.phone && data.address && data.city;
      default:
        return false;
    }
  };

  const getPrice = () => {
    return data.serviceType === "service_call" ? SERVICE_CALL_PRICE : CONSULTATION_PRICE;
  };

  const renderSidebar = () => {
    if (step === "zip" || step === "confirm") return null;

    return (
      <Card className="w-80 h-fit sticky top-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {data.serviceType === "service_call" ? "HVAC Service Call" : "Comfort Consultation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data.selectedDate && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>{format(data.selectedDate, "EEEE, MMMM do")}</span>
            </div>
          )}
          {data.selectedTimeSlot && (
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="h-4 w-4" />
              <span>{TIME_SLOTS.find(s => s.value === data.selectedTimeSlot)?.label}</span>
            </div>
          )}
          <div className="border-t pt-3 flex justify-between items-center">
            <span className="text-gray-600">Service Call</span>
            <span className="text-lg font-semibold text-red-600">${getPrice()}</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderStep = () => {
    switch (step) {
      case "zip":
        return (
          <div className="max-w-md mx-auto space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Book Your Appointment</h1>
              <p className="text-gray-600">Enter your zip code to check if we service your area</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="zipCode">Zip Code</Label>
                <Input
                  id="zipCode"
                  type="text"
                  placeholder="30901"
                  maxLength={5}
                  value={data.zipCode}
                  onChange={(e) => setData({ ...data, zipCode: e.target.value.replace(/\D/g, "") })}
                  className="text-lg py-6"
                />
                {zipError && <p className="text-red-600 text-sm mt-2">{zipError}</p>}
              </div>
              <Button
                className="w-full py-6 text-lg bg-[#722F37] hover:bg-[#5a252c]"
                disabled={!canProceed()}
                onClick={validateZip}
              >
                Check Availability
              </Button>
            </div>
          </div>
        );

      case "service":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Select Service</h1>
              <p className="text-gray-600">What type of appointment do you need?</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card
                className={`cursor-pointer transition-all hover:shadow-md ${
                  data.serviceType === "service_call" ? "ring-2 ring-[#722F37]" : ""
                }`}
                onClick={() => setData({ ...data, serviceType: "service_call" })}
              >
                <CardHeader>
                  <CardTitle className="text-xl">HVAC Service Call</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 text-sm mb-4">
                    For low priority services. We require a 48 hour lead time for online bookings.
                    For emergency service needs, call (706) 826-0644.
                  </p>
                  <p className="text-2xl font-bold text-[#722F37]">${SERVICE_CALL_PRICE}</p>
                </CardContent>
              </Card>
              <Card
                className={`cursor-pointer transition-all hover:shadow-md ${
                  data.serviceType === "consultation" ? "ring-2 ring-[#722F37]" : ""
                }`}
                onClick={() => setData({ ...data, serviceType: "consultation" })}
              >
                <CardHeader>
                  <CardTitle className="text-xl">Comfort Consultation</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 text-sm mb-4">
                    For consultations, we typically request at least 72 hours' notice.
                    If you need an earlier appointment, please give us a call.
                  </p>
                  <p className="text-2xl font-bold text-green-600">Free</p>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case "problem":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                {data.serviceType === "consultation" 
                  ? "Any current issues with your HVAC system?" 
                  : "What is the problem with your HVAC system?"}
              </h1>
              <p className="text-gray-600">
                {data.serviceType === "consultation" 
                  ? "Select any that apply (optional - skip if none)" 
                  : "Select all that apply"}
              </p>
            </div>
            <div className="space-y-3">
              {PROBLEM_OPTIONS.map((problem) => (
                <div
                  key={problem}
                  className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all hover:bg-gray-50 ${
                    data.problems.includes(problem) ? "border-[#722F37] bg-red-50" : ""
                  }`}
                  onClick={() => {
                    const newProblems = data.problems.includes(problem)
                      ? data.problems.filter((p) => p !== problem)
                      : [...data.problems, problem];
                    setData({ ...data, problems: newProblems });
                  }}
                >
                  <Checkbox checked={data.problems.includes(problem)} />
                  <span className="text-lg">{problem}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case "system":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">What type of system do you have?</h1>
              <p className="text-gray-600">
                {data.serviceType === "consultation" 
                  ? "Select your HVAC system type (optional - skip if unsure)" 
                  : "Select your HVAC system type"}
              </p>
            </div>
            <div className="space-y-3">
              {SYSTEM_TYPES.map((type) => (
                <div
                  key={type}
                  className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all hover:bg-gray-50 ${
                    data.systemType === type ? "border-[#722F37] bg-red-50" : ""
                  }`}
                  onClick={() => setData({ ...data, systemType: type })}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      data.systemType === type ? "border-[#722F37]" : "border-gray-300"
                    }`}
                  >
                    {data.systemType === type && (
                      <div className="w-3 h-3 rounded-full bg-[#722F37]" />
                    )}
                  </div>
                  <span className="text-lg">{type}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case "datetime":
        const dates = getAvailableDates();
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Date & Time</h1>
              <p className="text-gray-600">Pick a date and time, and we'll be there.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDateOffset(Math.max(0, dateOffset - 7))}
                disabled={dateOffset === 0}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 flex gap-2 overflow-x-auto py-2">
                {dates.map((date) => (
                  <button
                    key={date.toISOString()}
                    className={`flex-shrink-0 flex flex-col items-center px-4 py-3 rounded-lg border transition-all ${
                      data.selectedDate?.toDateString() === date.toDateString()
                        ? "bg-[#722F37] text-white border-[#722F37]"
                        : "hover:bg-gray-50"
                    }`}
                    onClick={() => setData({ ...data, selectedDate: date })}
                  >
                    <span className="text-sm font-medium">{format(date, "EEE")}</span>
                    <span className="text-lg font-bold">{format(date, "MMM d")}</span>
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDateOffset(dateOffset + 7)}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot.value}
                  className={`p-4 rounded-lg border text-center transition-all ${
                    data.selectedTimeSlot === slot.value
                      ? "bg-[#722F37] text-white border-[#722F37]"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => setData({ ...data, selectedTimeSlot: slot.value })}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>
        );

      case "info":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Your Information</h1>
              <p className="text-gray-600">How can we reach you?</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={data.firstName}
                  onChange={(e) => setData({ ...data, firstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={data.lastName}
                  onChange={(e) => setData({ ...data, lastName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={data.email}
                  onChange={(e) => setData({ ...data, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={data.phone}
                  onChange={(e) => setData({ ...data, phone: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="address">Service Address *</Label>
                <Input
                  id="address"
                  value={data.address}
                  onChange={(e) => setData({ ...data, address: e.target.value })}
                  placeholder="123 Main Street"
                />
              </div>
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={data.city}
                  onChange={(e) => setData({ ...data, city: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="zip">Zip Code</Label>
                <Input id="zip" value={data.zipCode} disabled />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="notes">Additional Notes (optional)</Label>
                <Input
                  id="notes"
                  value={data.notes}
                  onChange={(e) => setData({ ...data, notes: e.target.value })}
                  placeholder="Gate code, best time to call, etc."
                />
              </div>
            </div>
          </div>
        );

      case "confirm":
        return (
          <div className="max-w-lg mx-auto text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold">Booking Confirmed!</h1>
            <p className="text-gray-600">
              Thank you for booking with us. We've received your appointment request and will
              contact you shortly to confirm the details.
            </p>
            <Card>
              <CardContent className="pt-6 text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Service:</span>
                  <span className="font-medium">
                    {data.serviceType === "service_call" ? "HVAC Service Call" : "Comfort Consultation"}
                  </span>
                </div>
                {data.selectedDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Preferred Date:</span>
                    <span className="font-medium">{format(data.selectedDate, "EEEE, MMMM do")}</span>
                  </div>
                )}
                {data.selectedTimeSlot && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Preferred Time:</span>
                    <span className="font-medium">
                      {TIME_SLOTS.find(s => s.value === data.selectedTimeSlot)?.label}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-sm text-gray-500">
              A confirmation email has been sent to {data.email}
            </p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#722F37] text-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="text-2xl font-bold">GHVAC</div>
          <div className="text-sm opacity-80">Online Booking</div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {step !== "confirm" && step !== "zip" && (
          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              {["Service", "Details", "Date & Time", "Your Info"].map((label, i) => {
                const stepMap = { service: 0, problem: 1, system: 1, datetime: 2, info: 3 };
                const currentStepIndex = stepMap[step as keyof typeof stepMap] ?? 0;
                const isActive = i === currentStepIndex;
                const isComplete = i < currentStepIndex;
                return (
                  <div key={label} className="flex items-center gap-2">
                    {i > 0 && <div className="w-8 h-px bg-gray-300" />}
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        isActive
                          ? "bg-[#722F37] text-white"
                          : isComplete
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-8">
          <div className="flex-1">
            {renderStep()}

            {step !== "confirm" && step !== "zip" && (
              <div className="flex gap-4 mt-8">
                <Button variant="outline" onClick={handleBack}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                {step === "info" ? (
                  <Button
                    className="flex-1 bg-[#722F37] hover:bg-[#5a252c]"
                    disabled={!canProceed() || submitBooking.isPending}
                    onClick={handleSubmit}
                  >
                    {submitBooking.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Confirm Booking"
                    )}
                  </Button>
                ) : (
                  <Button
                    className="flex-1 bg-[#722F37] hover:bg-[#5a252c]"
                    disabled={!canProceed()}
                    onClick={handleNext}
                  >
                    Continue
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {renderSidebar()}
        </div>
      </div>
    </div>
  );
}
