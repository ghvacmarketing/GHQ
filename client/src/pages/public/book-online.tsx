import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Calendar, Clock, CheckCircle2, Loader2, MapPin, ArrowRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { format, addDays, startOfDay } from "date-fns";

const SERVICE_CALL_PRICE = 147;
const CONSULTATION_PRICE = 0;

const PROBLEM_OPTIONS_SERVICE = [
  "No cooling",
  "No Heating",
  "Thermostat issue",
  "Low airflow",
  "System water leak",
  "System is making noise",
  "Other issue",
];

const PROBLEM_OPTIONS_CONSULTATION = [
  "It's old!",
  "I just want an upgrade!",
  "No heating or cooling",
];

const SYSTEM_TYPES_SERVICE = [
  "Central Air (Split System)",
  "Heat Pump",
  "Ductless Mini Split",
  "Package Unit",
  "Furnace",
  "Boiler",
  "I'm not sure",
];

const SYSTEM_TYPES_CONSULTATION = [
  "Heat Pump",
  "Package Unit",
  "Mini Split",
  "Central Air",
];

const TIMELINE_OPTIONS = [
  { label: "Next week", value: "next_week" },
  { label: "Within the month", value: "within_month" },
  { label: "In two months", value: "in_two_months" },
  { label: "As soon as possible!", value: "asap" },
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

type Step = "zip" | "service" | "problem" | "system" | "projectType" | "timeline" | "datetime" | "info" | "confirm";

interface BookingData {
  zipCode: string;
  serviceType: "service_call" | "consultation" | "";
  problems: string[];
  systemType: string;
  projectType: "replacement" | "installation" | "";
  timeline: string;
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

const SERVICE_CALL_STEPS: Step[] = ["zip", "service", "problem", "system", "datetime", "info"];
const CONSULTATION_STEPS: Step[] = ["zip", "service", "system", "problem", "projectType", "timeline", "datetime", "info"];

export default function BookOnline() {
  const [step, setStep] = useState<Step>("zip");
  const [data, setData] = useState<BookingData>({
    zipCode: "",
    serviceType: "",
    problems: [],
    systemType: "",
    projectType: "",
    timeline: "",
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

  const getStepSequence = (): Step[] => {
    if (data.serviceType === "consultation") {
      return CONSULTATION_STEPS;
    }
    return SERVICE_CALL_STEPS;
  };

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
    const stepOrder = getStepSequence();
    const currentIndex = stepOrder.indexOf(step);
    
    if (currentIndex < stepOrder.length - 1) {
      setStep(stepOrder[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const stepOrder = getStepSequence();
    const currentIndex = stepOrder.indexOf(step);
    
    if (currentIndex > 0) {
      setStep(stepOrder[currentIndex - 1]);
    }
  };

  const handleServiceSelect = (serviceType: "service_call" | "consultation") => {
    setData({ 
      ...data, 
      serviceType, 
      problems: [], 
      systemType: "",
      projectType: "",
      timeline: ""
    });
    if (serviceType === "consultation") {
      setStep("system");
    } else {
      setStep("problem");
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
        return data.serviceType !== "";
      case "problem":
        return data.problems.length > 0;
      case "system":
        return data.systemType !== "";
      case "projectType":
        return data.projectType !== "";
      case "timeline":
        return data.timeline !== "";
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

  const getProgressValue = () => {
    const stepOrder = getStepSequence();
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex <= 1) return 0;
    return ((currentIndex - 1) / (stepOrder.length - 2)) * 100;
  };

  const getProblemOptions = () => {
    return data.serviceType === "consultation" ? PROBLEM_OPTIONS_CONSULTATION : PROBLEM_OPTIONS_SERVICE;
  };

  const getSystemTypes = () => {
    return data.serviceType === "consultation" ? SYSTEM_TYPES_CONSULTATION : SYSTEM_TYPES_SERVICE;
  };

  const renderSidebar = () => {
    if (step === "zip" || step === "service" || step === "confirm") return null;

    return (
      <Card className="w-80 h-fit sticky top-4 shadow-lg">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-lg">
            {data.serviceType === "service_call" ? "HVAC Service Call" : "Comfort Consultation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm pt-4">
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
            <span className="text-gray-600">Service</span>
            <span className={`text-xl font-bold ${getPrice() === 0 ? "text-green-600" : "text-[#722F37]"}`}>
              {getPrice() === 0 ? "Free" : `$${getPrice()}`}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderStep = () => {
    switch (step) {
      case "zip":
        return (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="max-w-md w-full text-center space-y-8">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-3">Book Online</h1>
                <p className="text-lg text-gray-600">Let's get started by entering your ZIP code.</p>
              </div>
              <div className="space-y-4">
                <div className="flex items-center bg-white rounded-full border-2 border-gray-200 overflow-hidden shadow-sm focus-within:border-[#722F37] focus-within:ring-2 focus-within:ring-[#722F37]/20 transition-all">
                  <div className="pl-4 pr-2">
                    <MapPin className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Enter ZIP code"
                    maxLength={5}
                    value={data.zipCode}
                    onChange={(e) => setData({ ...data, zipCode: e.target.value.replace(/\D/g, "") })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && data.zipCode.length === 5) {
                        validateZip();
                      }
                    }}
                    className="flex-1 py-4 px-2 text-lg outline-none bg-transparent"
                  />
                  <button
                    onClick={validateZip}
                    disabled={data.zipCode.length !== 5}
                    className="m-1 w-12 h-12 rounded-full bg-[#722F37] hover:bg-[#5a252c] disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <ArrowRight className="h-5 w-5 text-white" />
                  </button>
                </div>
                {zipError && (
                  <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{zipError}</p>
                )}
              </div>
            </div>
          </div>
        );

      case "service":
        return (
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Select Service</h1>
              <p className="text-gray-600">What type of appointment do you need?</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="bg-gray-50 border-b">
                  <CardTitle className="text-xl">HVAC Service Call</CardTitle>
                  <p className="text-2xl font-bold text-[#722F37]">${SERVICE_CALL_PRICE}</p>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <p className="text-gray-600 text-sm leading-relaxed">
                    This is for low priority services as we require a 48 hour lead time for online bookings. For any emergency service needs, call (706)-826-0644.
                  </p>
                  <Button 
                    className="w-full bg-[#722F37] hover:bg-[#5a252c]"
                    onClick={() => handleServiceSelect("service_call")}
                  >
                    Book Now
                  </Button>
                </CardContent>
              </Card>
              <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="bg-gray-50 border-b">
                  <CardTitle className="text-xl">Comfort Consultation</CardTitle>
                  <p className="text-2xl font-bold text-green-600">Free</p>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <p className="text-gray-600 text-sm leading-relaxed">
                    For consultations, we typically request at least 72 hours' notice for online bookings. However, if you need an earlier appointment, please give us a call.
                  </p>
                  <Button 
                    className="w-full bg-[#722F37] hover:bg-[#5a252c]"
                    onClick={() => handleServiceSelect("consultation")}
                  >
                    Book Now
                  </Button>
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
                  ? "What's going on with your system?" 
                  : "What is the problem with your HVAC system?"}
              </h1>
              <p className="text-gray-600">Select all that apply</p>
            </div>
            <div className="space-y-3">
              {getProblemOptions().map((problem) => (
                <div
                  key={problem}
                  className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50 ${
                    data.problems.includes(problem) ? "border-[#722F37] bg-red-50" : "border-gray-200"
                  }`}
                  onClick={() => {
                    const newProblems = data.problems.includes(problem)
                      ? data.problems.filter((p) => p !== problem)
                      : [...data.problems, problem];
                    setData({ ...data, problems: newProblems });
                  }}
                >
                  <Checkbox checked={data.problems.includes(problem)} className="border-2" />
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
              <p className="text-gray-600">Select your HVAC system type</p>
            </div>
            <div className="space-y-3">
              {getSystemTypes().map((type) => (
                <div
                  key={type}
                  className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50 ${
                    data.systemType === type ? "border-[#722F37] bg-red-50" : "border-gray-200"
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

      case "projectType":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Do you want a replacement or a new installation?</h1>
              <p className="text-gray-600">Select one option</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <button
                className={`p-6 border-2 rounded-xl text-center transition-all hover:bg-gray-50 ${
                  data.projectType === "replacement" 
                    ? "border-[#722F37] bg-red-50" 
                    : "border-gray-200"
                }`}
                onClick={() => setData({ ...data, projectType: "replacement" })}
              >
                <span className="text-xl font-medium">Replacement</span>
                <p className="text-gray-500 text-sm mt-1">Replace an existing system</p>
              </button>
              <button
                className={`p-6 border-2 rounded-xl text-center transition-all hover:bg-gray-50 ${
                  data.projectType === "installation" 
                    ? "border-[#722F37] bg-red-50" 
                    : "border-gray-200"
                }`}
                onClick={() => setData({ ...data, projectType: "installation" })}
              >
                <span className="text-xl font-medium">Installation</span>
                <p className="text-gray-500 text-sm mt-1">Install a brand new system</p>
              </button>
            </div>
          </div>
        );

      case "timeline":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">What is your timeline?</h1>
              <p className="text-gray-600">When do you need this completed?</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {TIMELINE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`p-5 border-2 rounded-xl text-center transition-all hover:bg-gray-50 ${
                    data.timeline === option.value 
                      ? "border-[#722F37] bg-red-50" 
                      : "border-gray-200"
                  }`}
                  onClick={() => setData({ ...data, timeline: option.value })}
                >
                  <span className="text-lg font-medium">{option.label}</span>
                </button>
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
                    className={`flex-shrink-0 flex flex-col items-center px-4 py-3 rounded-xl border-2 transition-all ${
                      data.selectedDate?.toDateString() === date.toDateString()
                        ? "bg-[#722F37] text-white border-[#722F37]"
                        : "border-gray-200 hover:bg-gray-50"
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
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    data.selectedTimeSlot === slot.value
                      ? "bg-[#722F37] text-white border-[#722F37]"
                      : "border-gray-200 hover:bg-gray-50"
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
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={data.lastName}
                  onChange={(e) => setData({ ...data, lastName: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={data.email}
                  onChange={(e) => setData({ ...data, email: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={data.phone}
                  onChange={(e) => setData({ ...data, phone: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="address">Service Address *</Label>
                <Input
                  id="address"
                  value={data.address}
                  onChange={(e) => setData({ ...data, address: e.target.value })}
                  placeholder="123 Main Street"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={data.city}
                  onChange={(e) => setData({ ...data, city: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="zip">Zip Code</Label>
                <Input id="zip" value={data.zipCode} disabled className="mt-1 bg-gray-50" />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="notes">Additional Notes (optional)</Label>
                <Input
                  id="notes"
                  value={data.notes}
                  onChange={(e) => setData({ ...data, notes: e.target.value })}
                  placeholder="Gate code, best time to call, etc."
                  className="mt-1"
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
            <Card className="shadow-lg">
              <CardContent className="pt-6 text-left space-y-3">
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
                {data.serviceType === "consultation" && data.projectType && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Project Type:</span>
                    <span className="font-medium capitalize">{data.projectType}</span>
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

      {step !== "zip" && step !== "service" && step !== "confirm" && (
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <Progress value={getProgressValue()} className="h-2" />
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex gap-8">
          <div className="flex-1">
            {renderStep()}

            {step !== "confirm" && step !== "zip" && step !== "service" && (
              <div className="flex gap-4 mt-8">
                <Button variant="outline" onClick={handleBack} className="px-6">
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                {step === "info" ? (
                  <Button
                    className="flex-1 bg-[#722F37] hover:bg-[#5a252c] py-6"
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
                    className="flex-1 bg-[#722F37] hover:bg-[#5a252c] py-6"
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
